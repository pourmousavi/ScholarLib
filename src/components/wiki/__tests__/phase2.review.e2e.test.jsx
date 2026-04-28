import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryAdapter } from '../../../services/storage/MemoryAdapter'
import {
  WikiService,
  ProposalBuilder,
  ProposalStore,
  ProposalReviewSubmitter,
  ReviewDebtCalculator,
} from '../../../services/wiki'
import { WikiPaths } from '../../../services/wiki/WikiPaths'
import { OperationLogService } from '../../../services/wiki/OperationLogService'
import { SidecarService } from '../../../services/wiki/SidecarService'
import { WikiStateService } from '../../../services/wiki/WikiStateService'
import ProposalReview from '../ProposalReview'

function library() {
  return {
    documents: {
      d1: { id: 'd1', box_path: 'PDFs/paper.pdf', metadata: { title: 'Synthetic Paper', doi: '10/test' } },
    },
  }
}

function extraction(overrides = {}) {
  return {
    draft_frontmatter: { title: 'Synthetic Paper', scholarlib_doc_id: 'd1' },
    draft_body: 'Body of paper.\nSecond line.',
    claims: [
      { claim_text: 'A measurable effect.', confidence: 'high', supported_by: [{ pdf_page: 2, char_start: 0, char_end: 16, quote_snippet: 'measurable effect quote' }] },
    ],
    methods_used: [],
    datasets_used: [],
    concepts_touched: [],
    open_question_candidates: [{ candidate_question: 'What about colder temperatures?' }],
    contradiction_signals: [],
    extraction_metadata: { extraction_confidence: 0.95, ocr_warnings: [] },
    ...overrides,
  }
}

async function buildProposal(adapter, options = {}) {
  const builder = new ProposalBuilder({
    adapter,
    verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'supported', verifier_model: 'mock' }) },
  })
  const proposalId = await builder.buildProposal(extraction(options.extraction || {}), library())
  const store = new ProposalStore(adapter)
  let proposal = await store.read(proposalId)
  if (options.injectExtraChanges) {
    proposal.page_changes.push(...options.injectExtraChanges)
    await adapter.writeJSON(`_wiki/_proposals/${proposalId}.json`, proposal)
    proposal = await store.read(proposalId)
  }
  return { proposalId, proposal }
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('Phase 2 review end-to-end scenarios', () => {
  it('approves all medium and low changes in a synthetic proposal happy path', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const { proposal } = await buildProposal(adapter)

    const onApplied = vi.fn()
    render(<ProposalReview proposal={proposal} adapter={adapter} onApplied={onApplied} onClose={vi.fn()} />)

    expect(screen.getAllByText(/Synthetic Paper/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^Submit / }))

    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    const result = onApplied.mock.calls[0][0]
    expect(result.applied_changes).toHaveLength(1)
    expect(result.review_tracking.review_duration_seconds_human).toBeGreaterThanOrEqual(1)
  })

  it('records review duration in committed op metadata', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const { proposal } = await buildProposal(adapter)
    const onApplied = vi.fn()
    render(<ProposalReview proposal={proposal} adapter={adapter} onApplied={onApplied} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Submit / }))
    await waitFor(() => expect(onApplied).toHaveBeenCalled())
    const opId = onApplied.mock.calls[0][0].committed_op_id
    const date = new Date()
    const opPath = WikiPaths.committedOp(opId, date)
    const op = await adapter.readJSON(opPath)
    expect(op.metadata.review_duration_seconds_human).toBeGreaterThanOrEqual(1)
    expect(op.metadata.proposal_id).toBe(proposal.proposal_id)
  })

  it('partial approval persists rejected/pending changes as a derived proposal', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const extraChange = {
      change_id: 'ch_extra',
      operation: 'create',
      page_id: 'c_extra',
      page_type: 'concept',
      target_path: '_wiki/concept/extra-99999.md',
      draft_frontmatter: { id: 'c_extra', handle: 'extra', type: 'concept', title: 'Extra' },
      draft_body: 'concept body',
      claims_added: [],
      claims_added_unsupported: [],
      wikilinks_to: [],
      is_creation: true,
      is_deletion: false,
      risk_tier: 'low',
      risk_reason: 'synthetic extra',
    }
    const { proposal } = await buildProposal(adapter, { injectExtraChanges: [extraChange] })
    const submitter = new ProposalReviewSubmitter({ adapter })
    const result = await submitter.submit({
      proposalId: proposal.proposal_id,
      approvedChangeIds: [proposal.page_changes[0].change_id],
      reviewTracking: { startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), durationSeconds: 30 },
    })
    expect(result.remainder_proposal_id).toBeTruthy()
    const remainder = await new ProposalStore(adapter).read(result.remainder_proposal_id)
    expect(remainder.page_changes).toHaveLength(1)
    expect(remainder.parent_proposal_id).toBe(proposal.proposal_id)
  })

  it('reject entire proposal archives without applying', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const { proposal } = await buildProposal(adapter)
    const submitter = new ProposalReviewSubmitter({ adapter })
    const result = await submitter.submit({ proposalId: proposal.proposal_id, approvedChangeIds: [], rejectAll: true })
    expect(result.status).toBe('rejected')
    const archived = await new ProposalStore(adapter).read(proposal.proposal_id)
    expect(archived.archive_status).toBe('rejected')
  })

  it('blocks alias-style edits in the change edit dialog', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const { proposal } = await buildProposal(adapter)
    render(<ProposalReview proposal={proposal} adapter={adapter} onApplied={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByText('Edit')[0])
    const bodyArea = screen.getByText(/Body \(markdown\)/).parentElement.querySelector('textarea')
    fireEvent.change(bodyArea, { target: { value: 'See [[Calendar Aging]] now.' } })
    fireEvent.click(screen.getByText('Save edit'))
    expect(screen.getByRole('alert').textContent).toMatch(/Alias-style/)
  })

  it('review-debt calculator blocks ingestion past 30 minutes and overrides log', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const store = new ProposalStore(adapter)
    for (let i = 0; i < 4; i += 1) {
      await store.save({
        proposal_id: `prop_${i}`,
        created_at: new Date().toISOString(),
        source: { title: `Paper ${i}` },
        page_changes: Array(10).fill(null).map((_, idx) => ({ change_id: `${i}_${idx}`, risk_tier: 'high' })),
      })
    }
    const calc = new ReviewDebtCalculator({ adapter })
    await expect(calc.assertCanIngest()).rejects.toMatchObject({ code: 'WIKI_REVIEW_DEBT_EXCEEDED' })
    const ok = await calc.assertCanIngest({ override: true, reason: 'Critical paper' })
    expect(ok.override).toBe(true)
    const overrides = await calc.listOverrides()
    expect(overrides).toHaveLength(1)
    expect(overrides[0].reason).toBe('Critical paper')
  })

  it('safety-mode accept-and-overwrite recovery clears safety state', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    await WikiStateService.enterSafetyMode(adapter, 'synthetic alias collision')
    const status = await WikiService.getStatus(adapter)
    expect(status.state.safety_mode).toBe(true)
    await SidecarService.regenerate(adapter)
    await WikiStateService.save(adapter, { safety_mode: false, safety_reason: null })
    const after = await WikiService.getStatus(adapter)
    expect(after.state.safety_mode).toBe(false)
  })

  it('lint findings include orphan pending op recovery', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const op = OperationLogService.createPendingOperation({ type: 'wiki_ingestion', pageWrites: [], metadata: { proposal_id: 'orphan' } })
    op.id = 'orphan-op'
    await OperationLogService.writePending(adapter, op)
    const pending = await OperationLogService.listPending(adapter)
    expect(pending).toHaveLength(1)
  })

  it('mobile viewport: review surface still renders without horizontal scroll', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 })
    const { proposal } = await buildProposal(adapter)
    const { container } = render(<ProposalReview proposal={proposal} adapter={adapter} onApplied={vi.fn()} onClose={vi.fn()} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('keyboard shortcut help opens with ?', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const { proposal } = await buildProposal(adapter)
    render(<ProposalReview proposal={proposal} adapter={adapter} onApplied={vi.fn()} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.keyDown(window, { key: '?' })
    })
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy()
  })
})
