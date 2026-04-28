import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { STORAGE_ERRORS } from '../../storage/StorageAdapter'
import { PaperExtractor } from '../extraction/PaperExtractor'
import { ProposalBuilder } from '../proposals/ProposalBuilder'
import { ProposalApplier } from '../proposals/ProposalApplier'
import { ProposalStore } from '../proposals/ProposalStore'
import { ProviderRouter } from '../ProviderRouter'
import { CostEstimator } from '../CostEstimator'
import { WikiService } from '../WikiService'
import { WikiPaths } from '../WikiPaths'

function fakeLibrary(doc = {}) {
  return {
    documents: {
      d1: {
        id: 'd1',
        box_path: 'PDFs/paper.pdf',
        metadata: { title: 'Synthetic Paper', doi: '10/synthetic' },
        ...doc,
      },
    },
  }
}

function fakeExtraction(overrides = {}) {
  return {
    draft_frontmatter: { title: 'Synthetic Paper', scholarlib_doc_id: 'd1' },
    draft_body: 'A concise paper page.',
    claims: [
      { claim_text: 'Synthetic claim one.', confidence: 'high', supported_by: [{ pdf_page: 1, char_start: 0, char_end: 12 }] },
      { claim_text: 'Synthetic claim two.', confidence: 'medium', supported_by: [{ pdf_page: 1, char_start: 13, char_end: 25 }] },
    ],
    methods_used: [],
    datasets_used: [],
    concepts_touched: [],
    open_question_candidates: [{ candidate_question: 'What next?', source_page: 1, source_text_hash: 'h' }],
    contradiction_signals: [],
    extraction_metadata: { extraction_confidence: 0.96, ocr_warnings: [], extraction_version: 'test' },
    ...overrides,
  }
}

describe('Phase 0B e2e scenarios', () => {
  it('cold ingestion and approval happy path against MemoryAdapter', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    await adapter.uploadFile('PDFs/paper.pdf', new Blob(['synthetic pdf text']))

    const extractor = new PaperExtractor({
      pdfTextExtractor: {
        extractPdf: async () => ({
          pages: [{ index: 0, text: 'synthetic pdf text supports claims', page_text_hash: 'page1' }],
          extraction_version: 'test',
          extraction_confidence: 0.96,
          ocr_warnings: [],
        }),
      },
      providerRouter: { route: vi.fn().mockResolvedValue({ provider: 'ollama', model: 'local', callOptions: {} }) },
      llmClient: { chat: vi.fn().mockResolvedValue(JSON.stringify(fakeExtraction())) },
    })
    const extraction = await extractor.extractPaper('d1', fakeLibrary(), adapter)
    expect(extraction.claims[0].supported_by[0]).toHaveProperty('span_text_hash')

    const builder = new ProposalBuilder({
      adapter,
      verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'supported', verifier_model: 'mock' }) },
    })
    const proposalId = await builder.buildProposal(extraction, fakeLibrary())
    const proposal = await new ProposalStore(adapter).read(proposalId)
    expect(proposal.page_changes[0].risk_tier).toBe('medium')

    const applied = await new ProposalApplier({ adapter }).applyProposal(proposalId, { mode: 'all' })
    expect(applied.applied_changes).toHaveLength(1)
    expect((await adapter.readJSON(WikiPaths.pagesSidecar)).count).toBe(1)
  })

  it('detects conflict when target page appears before approval', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const builder = new ProposalBuilder({ adapter })
    const proposalId = await builder.buildProposal(fakeExtraction({ draft_frontmatter: { id: 'p_conflict', title: 'Synthetic Paper', scholarlib_doc_id: 'd1' } }), fakeLibrary())
    const proposal = await new ProposalStore(adapter).read(proposalId)
    await adapter.writeTextIfRevision(proposal.page_changes[0].target_path, 'external', null)
    await expect(new ProposalApplier({ adapter }).applyProposal(proposalId, { mode: 'all' }))
      .rejects.toMatchObject({ code: 'WIKI_PROPOSAL_CONFLICT' })
  })

  it('enters safety mode when sidecar regeneration fails after page writes', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const builder = new ProposalBuilder({ adapter })
    const proposalId = await builder.buildProposal(fakeExtraction({ draft_frontmatter: { title: 'Same', aliases: ['collision'], scholarlib_doc_id: 'd1' } }), fakeLibrary())
    await adapter.writeTextIfRevision('_wiki/concept/existing.md', '---\nid: c_existing\nhandle: existing\ntype: concept\ntitle: Existing\naliases:\n  - collision\n---\nbody', null)
    const result = await new ProposalApplier({ adapter }).applyProposal(proposalId, { mode: 'all' })
    expect(result.sidecar_status.ok).toBe(false)
    expect((await WikiService.getStatus(adapter)).state.safety_mode).toBe(true)
  })

  it('blocks sensitivity and cost cap violations', async () => {
    const router = new ProviderRouter({
      capabilityCheck: { synthesis_grade_local: false },
      costEstimator: new CostEstimator({ caps: { single_operation_cap_usd: 0.001 } }),
    })
    await expect(router.route('extract_paper', { sensitivity: 'confidential', allowedProviders: ['ollama'] })).rejects.toMatchObject({ code: 'WIKI_SENSITIVITY_VIOLATION' })
    await expect(router.route('verify_claim', { sensitivity: 'public', estimatedTokensIn: 1000, estimatedTokensOut: 1000 })).rejects.toMatchObject({ code: 'WIKI_COST_CAP_EXCEEDED' })
  })

  it('is idempotent when re-applying archived proposals', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const proposalId = await new ProposalBuilder({ adapter }).buildProposal(fakeExtraction(), fakeLibrary())
    const applier = new ProposalApplier({ adapter })
    await applier.applyProposal(proposalId, { mode: 'all' })
    expect(await applier.applyProposal(proposalId, { mode: 'all' })).toMatchObject({ status: 'already_applied' })
  })
})
