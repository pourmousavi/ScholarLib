import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { PageStore } from '../PageStore'
import { SidecarService } from '../SidecarService'
import { WikiPaths } from '../WikiPaths'
import { IntentClassifier } from '../chat/IntentClassifier'
import { WikiRetrieval } from '../chat/WikiRetrieval'
import { CandidateStore } from '../chat/CandidateStore'
import { BenchmarkSession } from '../benchmark/BenchmarkSession'
import { QueryRewriter } from '../../ai/improved_rag/QueryRewriter'
import { Reranker } from '../../ai/improved_rag/Reranker'
import { PaperSummaryCache } from '../../ai/improved_rag/PaperSummaryCache'
import { HybridRetrieval } from '../../ai/improved_rag/HybridRetrieval'
import { ChatOrchestrator } from '../../ai/ChatOrchestrator'

async function seedWiki() {
  const adapter = new MemoryAdapter()
  await PageStore.writePage(adapter, {
    id: 'c_calendar',
    type: 'concept',
    title: 'Calendar Aging',
    aliases: ['calendar aging', 'battery aging'],
    frontmatter: { type: 'concept', title: 'Calendar Aging' },
    body: 'Calendar aging consensus. Links to [[p_smith]].',
  })
  await PageStore.writePage(adapter, {
    id: 'p_smith',
    type: 'paper',
    title: 'Smith 2025',
    frontmatter: { type: 'paper', title: 'Smith 2025', scholarlib_doc_id: 'doc-1' },
    body: 'Smith paper details.',
  })
  await SidecarService.regenerate(adapter)
  return adapter
}

describe('Phase 5 chat services', () => {
  it('classifies valid Ollama JSON and falls back on malformed output', async () => {
    const classifier = new IntentClassifier({
      ollamaService: { chat: vi.fn().mockResolvedValue('{"preference":"synthetic","confidence":"high","reasoning":"gaps"}') },
    })
    await expect(classifier.classify('What gaps exist?', [])).resolves.toMatchObject({ preference: 'synthetic', confidence: 'high' })

    const bad = new IntentClassifier({ ollamaService: { chat: vi.fn().mockResolvedValue('not json') } })
    await expect(bad.classify('anything', [])).resolves.toMatchObject({ preference: 'mixed', confidence: 'low' })
  })

  it('retrieves wiki pages by alias, expands wikilinks, and excludes candidate inbox', async () => {
    const adapter = await seedWiki()
    await new CandidateStore(adapter).saveCandidate({ question: 'calendar aging', answer: 'candidate answer' })
    const result = await new WikiRetrieval().retrieve('calendar aging', { type: 'library' }, {
      adapter,
      wikiEnabled: true,
      retrievalBudget: 5000,
    })
    expect(result.confidence).toBe('high')
    expect(result.pages.map(page => page.page_id)).toContain('c_calendar')
    expect(result.pages.map(page => page.page_id)).toContain('p_smith')
    expect(result.pages.some(page => page.content.includes('candidate answer'))).toBe(false)
  })

  it('scope filtering excludes paper pages outside the selected document scope', async () => {
    const adapter = await seedWiki()
    const result = await new WikiRetrieval().retrieve('Smith 2025', { type: 'document', docId: 'doc-2' }, {
      adapter,
      wikiEnabled: true,
      library: { documents: { 'doc-1': { id: 'doc-1' }, 'doc-2': { id: 'doc-2' } } },
    })
    expect(result.pages.some(page => page.page_id === 'p_smith')).toBe(false)
  })

  it('archives expired candidates', async () => {
    const adapter = new MemoryAdapter()
    const store = new CandidateStore(adapter)
    await store.saveCandidate({ question: 'old?', answer: 'old', expiresAfter: '1d' })
    const archived = await store.archiveExpired(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
    expect(archived[0]).toContain(WikiPaths.archivedChatCandidatesRoot)
  })

  it('runs improved-RAG helpers in isolation', async () => {
    const rewriter = new QueryRewriter({ ollamaService: { chat: vi.fn().mockResolvedValue('{"queries":["battery degradation"]}') } })
    await expect(rewriter.rewrite('calendar aging', [])).resolves.toEqual(['calendar aging', 'battery degradation'])

    const reranked = await new Reranker().rerank('calendar aging', [
      { doc_id: 'd1', text: 'unrelated text', score: 0.9 },
      { doc_id: 'd2', text: 'calendar aging model', score: 0.2 },
    ])
    expect(reranked[0].doc_id).toBe('d2')
  })

  it('caches paper summaries and hits on the second read', async () => {
    const adapter = new MemoryAdapter()
    const cache = new PaperSummaryCache()
    const first = await cache.getOrCreate(adapter, { id: 'doc-1', metadata: { title: 'Paper' } }, [{ text: 'summary source' }])
    const second = await cache.getOrCreate(adapter, { id: 'doc-1', metadata: { title: 'Paper' } }, [])
    expect(first.cache_hit).toBe(false)
    expect(second.cache_hit).toBe(true)
  })

  it('hybrid retrieval rewrites, dedupes, and reranks chunks', async () => {
    const indexService = {
      search: vi.fn().mockResolvedValue([
        { doc_id: 'doc-1', chunk_index: 1, text: 'calendar aging', score: 0.4 },
        { doc_id: 'doc-1', chunk_index: 1, text: 'calendar aging', score: 0.4 },
      ]),
    }
    const retriever = new HybridRetrieval({
      indexService,
      queryRewriter: { rewrite: vi.fn().mockResolvedValue(['calendar aging', 'battery degradation']) },
      summaryCache: { getOrCreate: vi.fn().mockResolvedValue({ doc_id: 'doc-1', summary: 'summary' }) },
    })
    const result = await retriever.retrieve('calendar aging', { type: 'library' }, { adapter: new MemoryAdapter(), topK: 5 })
    expect(indexService.search).toHaveBeenCalledTimes(2)
    expect(result.chunks).toHaveLength(1)
    expect(result.summaries).toHaveLength(1)
  })

  it('benchmark session randomizes, scores, aggregates, and writes routing defaults', async () => {
    const adapter = new MemoryAdapter()
    const orchestrator = {
      chat: vi.fn().mockImplementation(async function(query, history, scope, options) {
        return {
          provenance: { cost_estimate_usd: 0, routing: options.manual_route },
          stream: (async function* () { yield `answer ${options.manual_route}` })(),
        }
      }),
    }
    const session = new BenchmarkSession({ adapter, orchestrator })
    const row = await session.runQuestion({ id: 'q1', query: 'question', intent: 'synthetic' }, { adapter })
    expect(row.responses).toHaveLength(3)
    for (const response of row.responses) {
      session.score('q1', response.blinded_id, { usefulness: response.path === 'current_rag' ? 5 : 4, citation_correctness: 4, writing_utility: 4 })
    }
    const written = await session.writeReport()
    expect(written.defaults.synthetic_default).toBe('current_rag')
    expect(await adapter.readJSON(WikiPaths.chatRoutingDefaults)).toMatchObject({ synthetic_default: 'current_rag' })
  })

  it('orchestrator routes synthetic high-confidence wiki matches to wiki-only', async () => {
    const adapter = await seedWiki()
    const aiService = {
      buildSystemPrompt: vi.fn((scope, chunks) => chunks.map(chunk => chunk.citation).join('\n')),
      estimateTokens: vi.fn(() => 1),
      streamChat: vi.fn(async function* () { yield 'answer' }),
    }
    const orchestrator = new ChatOrchestrator({
      aiService,
      indexService: { search: vi.fn().mockResolvedValue([]), isIndexed: vi.fn().mockResolvedValue(true) },
      intentClassifier: { classify: vi.fn().mockResolvedValue({ preference: 'synthetic', confidence: 'high', reasoning: 'synthesis' }) },
      wikiRetrieval: new WikiRetrieval(),
    })
    const result = await orchestrator.chat('calendar aging', [], { type: 'library', description: 'entire library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: true,
    })
    expect(result.plan).toMatchObject({ use_wiki: true, use_rag: false })
    expect(result.provenance.wiki.page_count).toBeGreaterThan(0)
  })
})
