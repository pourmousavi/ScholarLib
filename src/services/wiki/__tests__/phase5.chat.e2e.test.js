import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { PageStore } from '../PageStore'
import { SidecarService } from '../SidecarService'
import { CandidateStore } from '../chat/CandidateStore'
import { WikiRetrieval } from '../chat/WikiRetrieval'
import { BenchmarkSession } from '../benchmark/BenchmarkSession'
import { WikiPaths } from '../WikiPaths'
import { ChatOrchestrator } from '../../ai/ChatOrchestrator'

async function seedAdapter() {
  const adapter = new MemoryAdapter()
  await PageStore.writePage(adapter, {
    id: 'c_consensus',
    type: 'concept',
    title: 'Calendar Aging Consensus',
    aliases: ['calendar aging', 'degradation consensus'],
    frontmatter: { type: 'concept', title: 'Calendar Aging Consensus' },
    body: 'Wiki consensus on calendar aging.',
  })
  await PageStore.writePage(adapter, {
    id: 'g_sensitive',
    type: 'grant',
    title: 'Private Grant Pattern',
    frontmatter: { type: 'grant', title: 'Private Grant Pattern', sensitivity: 'confidential' },
    body: 'Confidential grant pattern.',
  })
  await SidecarService.regenerate(adapter)
  return adapter
}

function makeOrchestrator({ intent = 'mixed', wikiConfidence = 'high', ragChunks = [{ doc_id: 'doc-1', chunk_index: 0, text: 'PDF chunk', citation: '[Smith 2025]', score: 0.7 }] } = {}) {
  const aiService = {
    buildSystemPrompt: vi.fn((scope, chunks) => chunks.map(chunk => chunk.citation).join('\n')),
    estimateTokens: vi.fn(() => 100),
    streamChat: vi.fn(async function* (messages) { yield messages[0].content }),
  }
  return new ChatOrchestrator({
    aiService,
    indexService: { isIndexed: vi.fn().mockResolvedValue(true), search: vi.fn().mockResolvedValue(ragChunks) },
    intentClassifier: { classify: vi.fn().mockResolvedValue({ preference: intent, confidence: 'high', reasoning: 'test' }) },
    wikiRetrieval: {
      retrieve: vi.fn(async (query, scope, options) => {
        const real = await new WikiRetrieval().retrieve(query, scope, options)
        return { ...real, confidence: wikiConfidence }
      }),
    },
  })
}

describe('Phase 5 chat e2e scenarios', () => {
  it('routes synthetic high-confidence wiki query to wiki', async () => {
    const adapter = await seedAdapter()
    const result = await makeOrchestrator({ intent: 'synthetic' }).chat('calendar aging', [], { type: 'library', description: 'library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: true,
    })
    expect(result.plan).toMatchObject({ use_wiki: true, use_rag: false })
    expect(result.systemPrompt).toContain('Wiki:')
  })

  it('routes extractive query to current RAG', async () => {
    const adapter = await seedAdapter()
    const result = await makeOrchestrator({ intent: 'extractive' }).chat('quote equation 4.2 from Smith 2025', [], { type: 'library', description: 'library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: true,
    })
    expect(result.plan).toMatchObject({ use_wiki: false, use_rag: true })
    expect(result.systemPrompt).toContain('[Smith 2025]')
  })

  it('merges both sources for mixed query and fallback synthetic low-confidence wiki', async () => {
    const adapter = await seedAdapter()
    const mixed = await makeOrchestrator({ intent: 'mixed' }).chat('compare degradation model', [], { type: 'library', description: 'library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: true,
    })
    expect(mixed.plan).toMatchObject({ use_wiki: true, use_rag: true })

    const fallback = await makeOrchestrator({ intent: 'synthetic', wikiConfidence: 'low' }).chat('weak unknown synthesis', [], { type: 'library', description: 'library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: true,
    })
    expect(fallback.plan).toMatchObject({ use_rag: true, fallback_reason: 'low_wiki_confidence' })
  })

  it('blocks cloud provider for synthetic sensitive content before model call', async () => {
    const adapter = await seedAdapter()
    const orchestrator = makeOrchestrator({ intent: 'synthetic' })
    await expect(orchestrator.chat('grant pattern', [], { type: 'library', description: 'library' }, {
      adapter,
      provider: 'claude',
      model: 'cloud',
      wikiEnabled: true,
    })).rejects.toMatchObject({ code: 'CHAT_SENSITIVITY_REFUSED' })
  })

  it('saves candidates, never retrieves candidate content, and archives TTL expiry', async () => {
    const adapter = await seedAdapter()
    const store = new CandidateStore(adapter)
    await store.saveCandidate({ question: 'calendar aging', answer: 'candidate-only phrase' })
    const retrieval = await new WikiRetrieval().retrieve('candidate-only phrase calendar aging', { type: 'library' }, { adapter, wikiEnabled: true })
    expect(retrieval.pages.some(page => page.content.includes('candidate-only phrase'))).toBe(false)
    const archived = await store.archiveExpired(new Date(Date.now() + 120 * 24 * 60 * 60 * 1000))
    expect(archived.length).toBe(1)
  })

  it('runs benchmark and writes defaults; orchestrator respects routing defaults and manual override', async () => {
    const adapter = await seedAdapter()
    const orchestrator = makeOrchestrator({ intent: 'synthetic' })
    const session = new BenchmarkSession({ adapter, orchestrator })
    const row = await session.runQuestion({ id: 'q1', query: 'calendar aging', intent: 'synthetic' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: true,
    })
    row.responses.forEach(response => session.score('q1', response.blinded_id, {
      usefulness: response.path === 'current_rag' ? 5 : 3,
      citation_correctness: 4,
      writing_utility: 4,
    }))
    await session.writeReport()
    expect((await adapter.readJSON(WikiPaths.chatRoutingDefaults)).synthetic_default).toBe('current_rag')

    const defaulted = await orchestrator.chat('calendar aging', [], { type: 'library', description: 'library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: true,
    })
    expect(defaulted.plan.source).toBe('benchmark_default')
    expect(defaulted.plan.use_rag).toBe(true)

    const override = await orchestrator.chat('calendar aging', [], { type: 'library', description: 'library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: true,
      manual_route: 'wiki_only',
    })
    expect(override.plan).toMatchObject({ source: 'manual', use_wiki: true, use_rag: false })
  })

  it('wiki feature flag off preserves Phase 4 RAG-only behavior', async () => {
    const adapter = await seedAdapter()
    const result = await makeOrchestrator({ intent: 'synthetic' }).chat('calendar aging', [], { type: 'library', description: 'library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      wikiEnabled: false,
    })
    expect(result.plan.source).toBe('wiki_disabled')
    expect(result.wiki.pages).toHaveLength(0)
    expect(result.plan.use_rag).toBe(true)
  })
})
