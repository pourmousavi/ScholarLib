import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { BootstrapContext, BOOTSTRAP_POSITIONS } from '../bootstrap/BootstrapContext'
import { BootstrapPlanService } from '../bootstrap/BootstrapPlanService'
import { PaperExtractor } from '../extraction/PaperExtractor'
import { ProposalBuilder } from '../proposals/ProposalBuilder'
import { WikiPaths } from '../WikiPaths'

function planFixture(overrides = {}) {
  return {
    own_papers: [],
    external_anchors: [],
    themes: ['theme-a'],
    targets: { own_papers: { min: 25, max: 30 }, external_anchors: { min: 10, max: 15 } },
    schema_revision_taken: false,
    ...overrides,
  }
}

async function seedPagesSidecar(adapter, pages = []) {
  await adapter.createFolder(WikiPaths.systemRoot)
  await adapter.writeJSON(WikiPaths.pagesSidecar, {
    version: '0A',
    generated_at: new Date().toISOString(),
    count: pages.length,
    pages,
    hash: 'sha256:test',
  })
}

async function seedPaperPage(adapter, { id, title, body, type = 'paper' }) {
  const path = WikiPaths.page(id, type, id)
  await adapter.createFolder(WikiPaths.typeRoot(type))
  const text = `---\nid: ${id}\ntitle: ${title}\n---\n\n${body}\n`
  await adapter.writeTextIfRevision(path, text, null)
  return path
}

describe('BootstrapContext.buildContext', () => {
  it('returns null when the doc is not in the plan', async () => {
    const adapter = new MemoryAdapter()
    const ctx = new BootstrapContext({ adapter })
    const result = await ctx.buildContext('missing-doc', { documents: {} }, planFixture())
    expect(result).toBeNull()
  })

  it('marks first-in-theme own-papers correctly', async () => {
    const adapter = new MemoryAdapter()
    await seedPagesSidecar(adapter, [])
    const plan = planFixture({
      own_papers: [
        { scholarlib_doc_id: 'doc-1', order: 1, theme: 'theme-a', status: 'queued' },
      ],
    })
    const ctx = new BootstrapContext({ adapter })
    const result = await ctx.buildContext('doc-1', { documents: { 'doc-1': {} } }, plan)
    expect(result.is_own_paper).toBe(true)
    expect(result.theme).toBe('theme-a')
    expect(result.bootstrap_position).toBe(BOOTSTRAP_POSITIONS.FIRST)
    expect(result.adjacent_papers).toEqual([])
    expect(result.theme_concept_pages).toEqual([])
  })

  it('marks subsequent-in-theme with adjacent paper summaries and concept pages', async () => {
    const adapter = new MemoryAdapter()
    await seedPaperPage(adapter, {
      id: 'p_paper1',
      title: 'Paper One',
      body: 'Body of paper one with several claims about X.',
    })
    const conceptPath = await seedPaperPage(adapter, {
      id: 'c_concept1',
      title: 'Concept One',
      type: 'concept',
      body: 'Concept page references [[p_paper1]]\n\n```scholarlib-claim\nid: cl_1\nclaim_text: foo\n```\n',
    })
    await seedPagesSidecar(adapter, [
      { id: 'p_paper1', title: 'Paper One', path: 'wiki/paper/p_paper1.md', revision: '1', hash: 'h1' },
      { id: 'c_concept1', title: 'Concept One', path: conceptPath, revision: '1', hash: 'h2' },
    ])
    // Re-seed paper page sidecar entry path for read
    const pagesSidecar = await adapter.readJSON(WikiPaths.pagesSidecar)
    pagesSidecar.pages[0].path = WikiPaths.page('p_paper1', 'paper', 'p_paper1')
    await adapter.writeJSON(WikiPaths.pagesSidecar, pagesSidecar)

    const plan = planFixture({
      own_papers: [
        {
          scholarlib_doc_id: 'doc-1',
          order: 1,
          theme: 'theme-a',
          status: 'ingested',
          paper_page_id: 'p_paper1',
        },
        { scholarlib_doc_id: 'doc-2', order: 2, theme: 'theme-a', status: 'queued' },
      ],
    })

    const ctx = new BootstrapContext({ adapter })
    const result = await ctx.buildContext('doc-2', { documents: { 'doc-2': {} } }, plan)
    expect(result.bootstrap_position).toBe(BOOTSTRAP_POSITIONS.SUBSEQUENT)
    expect(result.adjacent_papers).toHaveLength(1)
    expect(result.adjacent_papers[0].paper_page_id).toBe('p_paper1')
    expect(result.adjacent_papers[0].key_claims_summary).toContain('claims about X')
    expect(result.theme_concept_pages).toHaveLength(1)
    expect(result.theme_concept_pages[0].page_id).toBe('c_concept1')
    expect(result.theme_concept_pages[0].current_claims_count).toBe(1)
  })

  it('flags external anchors regardless of theme adjacency', async () => {
    const adapter = new MemoryAdapter()
    await seedPagesSidecar(adapter, [])
    const plan = planFixture({
      own_papers: [
        { scholarlib_doc_id: 'doc-1', order: 1, theme: 'theme-a', status: 'ingested', paper_page_id: 'p_x' },
      ],
      external_anchors: [
        { scholarlib_doc_id: 'doc-anchor', order: 1, theme: 'theme-a', status: 'queued' },
      ],
    })
    const ctx = new BootstrapContext({ adapter })
    const result = await ctx.buildContext('doc-anchor', { documents: { 'doc-anchor': {} } }, plan)
    expect(result.is_own_paper).toBe(false)
    expect(result.bootstrap_position).toBe(BOOTSTRAP_POSITIONS.EXTERNAL)
  })
})

describe('BootstrapContext.directiveFor', () => {
  it('produces a first-in-theme directive that mentions creation from scratch', () => {
    const directive = BootstrapContext.directiveFor({
      is_own_paper: true,
      bootstrap_position: BOOTSTRAP_POSITIONS.FIRST,
    })
    expect(directive).toMatch(/opens the theme/)
    expect(directive).toMatch(/Voice anchors/)
  })

  it('produces a subsequent directive that mentions not duplicating existing material', () => {
    const directive = BootstrapContext.directiveFor({
      is_own_paper: true,
      bootstrap_position: BOOTSTRAP_POSITIONS.SUBSEQUENT,
    })
    expect(directive).toMatch(/do not duplicate existing material/i)
  })

  it('produces an external-anchor directive that warns about creating new concepts', () => {
    const directive = BootstrapContext.directiveFor({
      is_own_paper: false,
      bootstrap_position: BOOTSTRAP_POSITIONS.EXTERNAL,
    })
    expect(directive).toMatch(/conservative about creating new concepts/i)
  })
})

describe('PaperExtractor with bootstrap context', () => {
  it('embeds bootstrap directive into the prompt and into extraction metadata', async () => {
    const adapter = new MemoryAdapter()
    await adapter.createFolder('PDFs')
    await adapter.writeTextIfRevision('PDFs/sample.pdf', '%PDF-1.4 fake', null)
    await adapter.writeTextIfRevision(WikiPaths.schema, '# WIKI_SCHEMA\nschema text', null)

    const llmClient = {
      chat: vi.fn().mockResolvedValue(JSON.stringify({
        draft_frontmatter: { title: 'Sample paper', aliases: [] },
        draft_body: '# Sample paper\n\nSummary body.',
        claims: [],
        methods_used: [],
        datasets_used: [],
        concepts_touched: [],
        open_question_candidates: [],
        contradiction_signals: [],
        extraction_metadata: { tokens_out: 200 },
      })),
      isAvailable: () => true,
      getLastError: () => null,
      isConfigured: () => true,
    }

    const pdfTextExtractor = {
      extractPdf: vi.fn().mockResolvedValue({
        pages: [{ index: 0, text: 'Body of the paper', page_text_hash: 'sha256:p0' }],
        extraction_version: 'pdfjs-test',
        extraction_confidence: 0.95,
        ocr_warnings: [],
      }),
    }

    const providerRouter = {
      route: vi.fn().mockResolvedValue({ provider: 'ollama', model: 'llama3.1', callOptions: {} }),
    }

    const extractor = new PaperExtractor({ pdfTextExtractor, providerRouter, llmClient })
    const library = {
      documents: {
        'doc-1': { id: 'doc-1', box_path: 'PDFs/sample.pdf', metadata: { title: 'Sample paper' } },
      },
    }

    const bootstrapContext = {
      is_own_paper: true,
      theme: 'theme-a',
      bootstrap_position: 'first_in_theme',
      adjacent_papers: [],
      theme_concept_pages: [],
    }

    const result = await extractor.extractPaper('doc-1', library, adapter, { bootstrapContext })
    expect(llmClient.chat).toHaveBeenCalled()
    const userPrompt = llmClient.chat.mock.calls[0][0][1].content
    expect(userPrompt).toMatch(/Phase 3 bootstrap context/)
    expect(userPrompt).toMatch(/first_in_theme/)
    expect(userPrompt).toMatch(/opens the theme/)
    expect(result.bootstrap_context.bootstrap_position).toBe('first_in_theme')
  })
})

describe('ProposalBuilder with bootstrap context', () => {
  it('embeds bootstrap_context into the saved proposal', async () => {
    const adapter = new MemoryAdapter()
    const builder = new ProposalBuilder({
      adapter,
      verifier: { verifyClaim: vi.fn().mockResolvedValue({ status: 'supported' }) },
    })
    const extraction = {
      draft_frontmatter: { title: 'Sample', aliases: [], scholarlib_doc_id: 'doc-1' },
      draft_body: '# Sample\nBody',
      claims: [],
      open_question_candidates: [],
      contradiction_signals: [],
      extraction_metadata: { tokens_out: 100 },
      bootstrap_context: {
        is_own_paper: true,
        theme: 'theme-a',
        bootstrap_position: 'first_in_theme',
        adjacent_paper_ids: [],
        theme_concept_page_ids: [],
      },
    }
    const proposalId = await builder.buildProposal(extraction, {
      documents: { 'doc-1': { id: 'doc-1', metadata: { title: 'Sample' } } },
    })
    const stored = await adapter.readJSON(WikiPaths.proposal(proposalId))
    expect(stored.bootstrap_context).toEqual(extraction.bootstrap_context)
  })
})

describe('BootstrapPlanService integration', () => {
  it('shares plan state with BootstrapContext', async () => {
    const adapter = new MemoryAdapter()
    const service = new BootstrapPlanService({ adapter })
    await service.addPaper('own_papers', 'doc-1', 'theme-a')
    await seedPagesSidecar(adapter, [])
    const plan = await service.loadPlan()
    const ctx = new BootstrapContext({ adapter })
    const result = await ctx.buildContext('doc-1', { documents: { 'doc-1': {} } }, plan)
    expect(result.bootstrap_position).toBe('first_in_theme')
    expect(result.theme).toBe('theme-a')
  })
})
