import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { WikiService } from '../WikiService'
import { ProposalBuilder } from '../proposals/ProposalBuilder'
import { ProposalStore } from '../proposals/ProposalStore'
import { ProposalReviewSubmitter } from '../proposals/ProposalReviewSubmitter'

function library() {
  return {
    documents: {
      d1: { id: 'd1', box_path: 'PDFs/paper.pdf', metadata: { title: 'Paper', doi: '10/test' } },
    },
  }
}

function extraction() {
  return {
    draft_frontmatter: { title: 'Paper', scholarlib_doc_id: 'd1' },
    draft_body: 'Body of paper.',
    claims: [],
    methods_used: [],
    datasets_used: [],
    concepts_touched: [],
    open_question_candidates: [],
    contradiction_signals: [],
    extraction_metadata: { extraction_confidence: 0.96, ocr_warnings: [] },
  }
}

describe('ProposalReviewSubmitter', () => {
  it('creates a derived remainder proposal when some changes are left pending', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const builder = new ProposalBuilder({
      adapter,
      verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'supported' }) },
    })
    const proposalId = await builder.buildProposal(extraction(), library())
    const store = new ProposalStore(adapter)
    const original = await store.read(proposalId)
    original.page_changes.push({
      change_id: 'extra_change',
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
      risk_reason: 'synthetic',
    })
    await adapter.writeJSON(`_wiki/_proposals/${proposalId}.json`, original)

    const approvedId = original.page_changes[0].change_id
    const result = await new ProposalReviewSubmitter({ adapter }).submit({
      proposalId,
      approvedChangeIds: [approvedId],
      reviewTracking: { startedAt: '2026-04-28T00:00:00Z', endedAt: '2026-04-28T00:03:00Z', durationSeconds: 180 },
    })
    expect(result.applied_changes).toHaveLength(1)
    expect(result.remainder_proposal_id).toBeTruthy()
    const remainder = await store.read(result.remainder_proposal_id)
    expect(remainder.page_changes.map((change) => change.change_id)).toEqual(['extra_change'])
    expect(remainder.parent_proposal_id).toBe(proposalId)
  })

  it('archives the proposal as rejected when all changes are rejected', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const proposalId = await new ProposalBuilder({ adapter }).buildProposal(extraction(), library())
    const result = await new ProposalReviewSubmitter({ adapter }).submit({
      proposalId,
      approvedChangeIds: [],
      rejectAll: true,
    })
    expect(result.status).toBe('rejected')
    const store = new ProposalStore(adapter)
    const archived = await store.read(proposalId)
    expect(archived.archive_status).toBe('rejected')
  })

  it('passes review tracking through to the committed operation metadata', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const proposalId = await new ProposalBuilder({ adapter }).buildProposal(extraction(), library())
    const store = new ProposalStore(adapter)
    const proposal = await store.read(proposalId)
    const result = await new ProposalReviewSubmitter({ adapter }).submit({
      proposalId,
      approvedChangeIds: proposal.page_changes.map((change) => change.change_id),
      reviewTracking: { startedAt: '2026-04-28T00:00:00Z', endedAt: '2026-04-28T00:04:30Z', durationSeconds: 270 },
    })
    expect(result.committed_op_id).toBeTruthy()
    const opPath = `_wiki/_ops/${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, '0')}/op_${result.committed_op_id}.committed.json`
    const op = await adapter.readJSON(opPath)
    expect(op.metadata.review_duration_seconds_human).toBe(270)
    expect(op.metadata.review_started_at).toBe('2026-04-28T00:00:00Z')
  })
})
