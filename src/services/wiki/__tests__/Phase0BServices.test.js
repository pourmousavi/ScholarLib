import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { PaperExtractor } from '../extraction/PaperExtractor'
import { RiskTierer } from '../RiskTierer'
import { ProposalBuilder, findPaperBySourceDocId } from '../proposals/ProposalBuilder'
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
          .mockResolvedValueOnce('not json')
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

  it('normalizes model output when draft_body is returned as an object', async () => {
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
        chat: vi.fn().mockResolvedValue(JSON.stringify({
          ...extraction,
          draft_body: {
            summary: 'The paper studies calendar aging.',
            sections: [{ title: 'Findings', body: 'Temperature increases degradation.' }],
          },
          claims: [{ text: 'Temperature increases degradation.', evidence: [{ pdf_page: 1, char_start: 0, char_end: 20 }] }],
        })),
      },
    })
    const result = await extractor.extractPaper('d1', library, adapter)
    expect(result.draft_body).toContain('The paper studies calendar aging.')
    expect(result.draft_body).toContain('## Findings')
    expect(result.claims[0]).toMatchObject({ claim_text: 'Temperature increases degradation.', confidence: 'medium' })
  })

  it('rejects extraction when the model JSON omits every body field, after one retry', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const bodylessResponse = JSON.stringify({
      draft_frontmatter: { title: 'Sample paper' },
      // intentionally no draft_body / body / markdown / summary / abstract
      claims: [],
      methods_used: [],
      datasets_used: [],
      concepts_touched: [],
      open_question_candidates: [],
      contradiction_signals: [],
    })
    const chat = vi.fn()
      .mockResolvedValueOnce(bodylessResponse)
      .mockResolvedValueOnce(bodylessResponse)
    const extractor = new PaperExtractor({
      pdfTextExtractor: {
        extractPdf: async () => ({
          pages: [{ index: 0, text: 'paper text', page_text_hash: 'h' }],
          extraction_version: 'test',
          extraction_confidence: 0.9,
          ocr_warnings: [],
        }),
      },
      providerRouter: { route: vi.fn().mockResolvedValue({ provider: 'ollama', model: 'local', callOptions: {} }) },
      llmClient: { chat },
    })
    await expect(extractor.extractPaper('d1', library, adapter)).rejects.toMatchObject({
      code: 'WIKI_EXTRACTION_VALIDATION_ERROR',
      message: expect.stringContaining('draft_body is empty'),
    })
    // Confirm the extractor actually retried once before giving up.
    expect(chat).toHaveBeenCalledTimes(2)
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

  it('composes the page body with claim blocks, methods, datasets, concepts, and open questions', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const richExtraction = {
      ...extraction,
      methods_used: ['model predictive control', 'machine learning'],
      datasets_used: ['ARENA AEMO 2023'],
      concepts_touched: ['battery aging', 'state of health'],
      open_question_candidates: [{ candidate_question: 'Does cycling rate dominate calendar aging at high temperatures?' }],
      claims: [
        {
          claim_text: 'Calendar aging accelerates above 35°C.',
          confidence: 'high',
          supported_by: [{ pdf_page: 4, char_start: 120, char_end: 240, page_text_hash: 'sha256:abc' }],
        },
      ],
    }
    const builder = new ProposalBuilder({
      adapter,
      verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'supported', verifier_model: 'mock', justification: 'ok' }) },
    })
    const proposal = await new ProposalStore(adapter).read(await builder.buildProposal(richExtraction, library))
    const body = proposal.page_changes[0].draft_body
    expect(body).toContain('## Claims')
    expect(body).toContain('```scholarlib-claim')
    expect(body).toContain('claim_text: Calendar aging accelerates above 35°C.')
    expect(body).toContain('verifier_status: supported')
    expect(body).toContain('## Methods used')
    expect(body).toContain('- model predictive control')
    expect(body).toContain('## Datasets used')
    expect(body).toContain('- ARENA AEMO 2023')
    expect(body).toContain('## Concepts touched')
    expect(body).toContain('- battery aging')
    expect(body).toContain('## Open questions')
    expect(body).toContain('```scholarlib-question-candidate')
  })

  it('omits structured sections that have no entries (clean body for sparse extractions)', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const minimal = { ...extraction, methods_used: [], datasets_used: [], concepts_touched: [], open_question_candidates: [], claims: [] }
    const builder = new ProposalBuilder({ adapter })
    const proposal = await new ProposalStore(adapter).read(await builder.buildProposal(minimal, library))
    const body = proposal.page_changes[0].draft_body
    expect(body).not.toContain('## Claims')
    expect(body).not.toContain('## Methods used')
    expect(body).not.toContain('## Datasets used')
    expect(body).not.toContain('## Concepts touched')
    expect(body).not.toContain('## Open questions')
    expect(body.trim()).toBe('Summary with no links.')
  })

  it('finds an existing paper page by scholarlib_doc_id once sidecars are regenerated', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const builder = new ProposalBuilder({
      adapter,
      verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'supported', verifier_model: 'mock', justification: 'ok' }) },
    })
    const proposalId = await builder.buildProposal(extraction, library)
    await new ProposalApplier({ adapter }).applyProposal(proposalId, { mode: 'all' })
    const found = await findPaperBySourceDocId(adapter, 'd1')
    expect(found).toBeTruthy()
    expect(found.scholarlib_doc_id).toBe('d1')
    expect(found.id.startsWith('p_')).toBe(true)
    expect(await findPaperBySourceDocId(adapter, 'unknown-doc')).toBeNull()
  })

  it('supersedes the old paper page when re-ingesting the same source document', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const builder = new ProposalBuilder({
      adapter,
      verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'supported', verifier_model: 'mock', justification: 'ok' }) },
    })

    // First ingestion
    const firstProposalId = await builder.buildProposal(extraction, library)
    await new ProposalApplier({ adapter }).applyProposal(firstProposalId, { mode: 'all' })
    const firstPaper = await findPaperBySourceDocId(adapter, 'd1')
    expect(firstPaper).toBeTruthy()
    const oldPageId = firstPaper.id

    // Second ingestion with supersedeOldPaperId — proposal should include
    // an archive modify change for the original page.
    const secondProposalId = await builder.buildProposal(
      { ...extraction, draft_body: 'Refreshed summary.' },
      library,
      { supersedeOldPaperId: oldPageId }
    )
    const proposal = await new ProposalStore(adapter).read(secondProposalId)
    expect(proposal.page_changes).toHaveLength(2)
    const archiveChange = proposal.page_changes.find((change) => change.page_id === oldPageId)
    expect(archiveChange).toBeTruthy()
    expect(archiveChange.operation).toBe('modify')
    expect(archiveChange.draft_frontmatter.archived).toBe(true)
    expect(archiveChange.draft_frontmatter.archive_reason).toBe('superseded')
    expect(archiveChange.draft_frontmatter.superseded_by).toMatch(/^p_/)
    expect(archiveChange.risk_tier).toBe('low')

    // Apply — old page must come back archived; new page is canonical.
    await new ProposalApplier({ adapter }).applyProposal(secondProposalId, { mode: 'all' })
    const { PageStore } = await import('../PageStore')
    const oldPage = await PageStore.readPage(adapter, oldPageId)
    expect(oldPage.frontmatter.archived).toBe(true)
    expect(oldPage.frontmatter.superseded_by).toMatch(/^p_/)
    expect(oldPage.frontmatter.superseded_by).not.toBe(oldPageId)

    // findPaperBySourceDocId should now skip the archived page and return
    // the new one (so a third ingest would supersede the new page, not the
    // archived old one).
    const current = await findPaperBySourceDocId(adapter, 'd1')
    expect(current.id).not.toBe(oldPageId)
    expect(current.archived).toBeFalsy()
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
