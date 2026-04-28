import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { PaperExtractor } from '../extraction/PaperExtractor'
import { RiskTierer } from '../RiskTierer'
import { ProposalBuilder } from '../proposals/ProposalBuilder'
import { ProposalApplier } from '../proposals/ProposalApplier'
import { ProposalStore } from '../proposals/ProposalStore'
import { PositionDraftService } from '../positions/PositionDraftService'
import { WikiService } from '../WikiService'
import { WikiPaths } from '../WikiPaths'
import { ProviderRouter } from '../ProviderRouter'
import { CostEstimator } from '../CostEstimator'

const library = {
  documents: {
    d1: {
      id: 'd1',
      box_path: 'PDFs/paper.pdf',
      metadata: { title: 'Calendar Aging Study', doi: '10/test', authors: [{ first: 'A', last: 'Z' }] },
    },
  },
}

const extraction = {
  draft_frontmatter: { title: 'Calendar Aging Study', scholarlib_doc_id: 'd1' },
  draft_body: 'Summary with no links.',
  claims: [
    { claim_text: 'Calendar aging increases with temperature.', confidence: 'high', supported_by: [{ pdf_page: 1, char_start: 0, char_end: 20 }] },
  ],
  methods_used: [],
  datasets_used: [],
  concepts_touched: [],
  open_question_candidates: [],
  contradiction_signals: [],
  extraction_metadata: { extraction_confidence: 0.95, ocr_warnings: [] },
}

describe('wiki Phase 0B services', () => {
  it('extracts structured paper output, hashes locators, redacts sensitive snippets, and retries validation once', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const extractor = new PaperExtractor({
      pdfTextExtractor: {
        extractPdf: async () => ({
          pages: [{ index: 0, text: 'calendar aging evidence text', page_text_hash: 'page-hash' }],
          extraction_version: 'test',
          extraction_confidence: 0.95,
          ocr_warnings: [],
        }),
      },
      providerRouter: { route: vi.fn().mockResolvedValue({ provider: 'ollama', model: 'local', callOptions: {} }) },
      llmClient: {
        chat: vi.fn()
          .mockResolvedValueOnce('{"bad":true}')
          .mockResolvedValueOnce(JSON.stringify({ ...extraction, draft_frontmatter: { ...extraction.draft_frontmatter, sensitivity: 'confidential' } })),
      },
    })
    const result = await extractor.extractPaper('d1', {
      documents: { d1: { ...library.documents.d1, wiki: { sensitivity: 'confidential', allowed_providers: ['ollama'] } } },
    }, adapter)
    expect(result.claims[0].supported_by[0].page_text_hash).toBe('page-hash')
    expect(result.claims[0].supported_by[0].quote_snippet).toBeNull()
  })

  it('falls back to configured Claude for public extraction when Ollama is unavailable', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const llmClient = {
      isAvailable: vi.fn().mockResolvedValue(false),
      getLastError: () => 'Cannot reach Ollama - check CORS settings',
      isConfigured: (provider) => provider === 'claude',
      chat: vi.fn().mockResolvedValue(JSON.stringify(extraction)),
    }
    const extractor = new PaperExtractor({
      pdfTextExtractor: {
        extractPdf: async () => ({
          pages: [{ index: 0, text: 'calendar aging evidence text', page_text_hash: 'page-hash' }],
          extraction_version: 'test',
          extraction_confidence: 0.95,
          ocr_warnings: [],
        }),
      },
      providerRouter: new ProviderRouter({
        capabilityCheck: { synthesis_grade_local: true, models: [{ name: 'llama3.1:8b' }] },
        costEstimator: new CostEstimator(),
      }),
      llmClient,
    })
    await extractor.extractPaper('d1', library, adapter)
    expect(llmClient.chat.mock.calls[0][3]).toBe('claude')
  })

  it('does not cloud-fallback for confidential extraction when Ollama is unavailable', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const extractor = new PaperExtractor({
      pdfTextExtractor: {
        extractPdf: async () => ({
          pages: [{ index: 0, text: 'calendar aging evidence text', page_text_hash: 'page-hash' }],
          extraction_version: 'test',
          extraction_confidence: 0.95,
          ocr_warnings: [],
        }),
      },
      providerRouter: new ProviderRouter({
        capabilityCheck: { synthesis_grade_local: true, models: [{ name: 'llama3.1:8b' }] },
        costEstimator: new CostEstimator(),
      }),
      llmClient: {
        isAvailable: vi.fn().mockResolvedValue(false),
        getLastError: () => 'Cannot reach Ollama',
        isConfigured: () => true,
        chat: vi.fn(),
      },
    })
    await expect(extractor.extractPaper('d1', {
      documents: { d1: { ...library.documents.d1, wiki: { sensitivity: 'confidential', allowed_providers: ['ollama'] } } },
    }, adapter)).rejects.toMatchObject({ code: 'OLLAMA_UNAVAILABLE' })
  })

  it('applies deterministic risk-tier precedence', () => {
    const tierer = new RiskTierer()
    expect(tierer.reasonForChange({ is_deletion: true, is_creation: true, page_type: 'paper' }).tier).toBe('high')
    expect(tierer.reasonForChange({ operation: 'modify', page_type: 'concept' }).tier).toBe('medium')
    expect(tierer.reasonForChange({ is_creation: true, page_type: 'paper' }).tier).toBe('low')
    expect(tierer.tierForProposal([{ risk_tier: 'low' }, { risk_tier: 'high' }])).toBe('high')
  })

  it('builds and applies a single-paper proposal end-to-end', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const builder = new ProposalBuilder({
      adapter,
      verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'supported', verifier_model: 'mock', justification: 'ok' }) },
    })
    const proposalId = await builder.buildProposal(extraction, library)
    const proposal = await new ProposalStore(adapter).read(proposalId)
    expect(proposal.page_changes[0].risk_tier).toBe('low')

    const result = await new ProposalApplier({ adapter }).applyProposal(proposalId, { mode: 'all' })
    expect(result.applied_changes).toHaveLength(1)
    expect((await adapter.readJSON(WikiPaths.pagesSidecar)).count).toBe(1)
    expect(await new ProposalStore(adapter).read(proposalId)).toMatchObject({ archive_status: 'accepted' })
  })

  it('rejects alias-style wikilinks before proposal save', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const builder = new ProposalBuilder({ adapter })
    await expect(builder.buildProposal({ ...extraction, draft_body: 'See [[calendar aging]].' }, library))
      .rejects.toThrow('Unresolved alias-style wikilink')
  })

  it('preserves unsupported claims outside canonical applied claims', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const builder = new ProposalBuilder({
      adapter,
      verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'unsupported', verifier_model: 'mock', justification: 'no' }) },
    })
    const proposal = await new ProposalStore(adapter).read(await builder.buildProposal(extraction, library))
    expect(proposal.page_changes[0].claims_added).toHaveLength(0)
    expect(proposal.page_changes[0].claims_added_unsupported[0]).toMatchObject({ canonical_action: 'do_not_apply' })
  })

  it('reads and writes position draft pages with required voice status', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const service = new PositionDraftService(adapter)
    const page = await service.writeDraft('My Draft', { title: 'My Draft' }, 'body')
    expect(page.frontmatter.voice_status).toBe('draft_requires_human_edit')
    expect(await service.listDrafts()).toHaveLength(1)
  })
})
