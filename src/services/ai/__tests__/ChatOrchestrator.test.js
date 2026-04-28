import { describe, expect, it, vi } from 'vitest'
import { ChatOrchestrator } from '../ChatOrchestrator'
import { SensitivityGate } from '../../wiki/SensitivityGate'
import { CostEstimator } from '../../wiki/CostEstimator'

function makeAIService(chunks = []) {
  return {
    buildSystemPrompt: vi.fn((scope, retrievedChunks, maxContextChars) =>
      `scope=${scope.description}; max=${maxContextChars}; chunks=${retrievedChunks.length}`
    ),
    estimateTokens: vi.fn((text) => Math.ceil(text.length / 4)),
    streamChat: vi.fn(async function* (messages) {
      yield `answer:${messages[messages.length - 1].content}:${chunks.length}`
    }),
  }
}

describe('ChatOrchestrator', () => {
  it('classifies all Phase 4 queries as extractive', async () => {
    const orchestrator = new ChatOrchestrator()
    await expect(orchestrator.classifyIntent('synthesise this', [])).resolves.toBe('extractive')
  })

  it('retrieves RAG with current topK and WebLLM context budget', async () => {
    const chunks = [{ doc_id: 'd1', chunk_index: 0, score: 0.8, text: 'chunk', citation: '[A 2024]' }]
    const indexService = {
      isIndexed: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue(chunks),
    }
    const aiService = makeAIService(chunks)
    const orchestrator = new ChatOrchestrator({ indexService, aiService })

    const result = await orchestrator.chat('q', [], { type: 'document', docId: 'd1', description: 'doc' }, {
      adapter: {},
      provider: 'webllm',
      model: 'browser-model',
    })

    expect(indexService.search).toHaveBeenCalledWith(
      'q',
      expect.objectContaining({ type: 'document', docId: 'd1' }),
      {},
      3
    )
    expect(aiService.buildSystemPrompt).toHaveBeenCalledWith(expect.any(Object), chunks, 6000)
    expect(result.provenance.retrieval.rag.top_k_used).toBe(3)
  })

  it('keeps wiki retrieval stubbed in Phase 4', async () => {
    const orchestrator = new ChatOrchestrator()
    await expect(orchestrator.retrieveWiki('q', {}, {})).resolves.toEqual({ pages: [], confidence: 0 })
  })

  it('builds provider payloads with the same message order and prompt source', async () => {
    const chunks = [{ doc_id: 'd1', chunk_index: 0, score: 0.8, text: 'chunk', citation: '[A 2024]' }]
    const aiService = makeAIService(chunks)
    const orchestrator = new ChatOrchestrator({
      aiService,
      indexService: {
        isIndexed: vi.fn().mockResolvedValue(true),
        search: vi.fn().mockResolvedValue(chunks),
      },
    })

    const result = await orchestrator.chat('new question', [{ role: 'user', content: 'old question' }], {
      type: 'library',
      description: 'entire library',
    }, {
      adapter: {},
      provider: 'claude',
      model: 'configured-model',
    })

    expect(result.messages).toEqual([
      { role: 'system', content: 'scope=entire library; max=12000; chunks=1' },
      { role: 'user', content: 'old question' },
      { role: 'user', content: 'new question' },
    ])
    expect(result.provenance).toMatchObject({
      classification: 'extractive',
      provider: { name: 'claude', model: 'configured-model' },
      retrieval: { wiki: { pages: [], confidence: 0 } },
    })
  })

  it('refuses confidential content before prompt assembly without leaking prompt text', async () => {
    const aiService = makeAIService()
    const orchestrator = new ChatOrchestrator({
      aiService,
      sensitivityGate: new SensitivityGate(),
    })

    await expect(orchestrator.chat('secret grant text', [], { type: 'library', description: 'library' }, {
      adapter: {},
      provider: 'claude',
      model: 'cloud-model',
      sensitivity: 'confidential',
      allowedProviders: ['ollama'],
    })).rejects.toMatchObject({
      code: 'CHAT_SENSITIVITY_REFUSED',
      message: expect.not.stringContaining('secret grant text'),
    })
    expect(aiService.buildSystemPrompt).not.toHaveBeenCalled()
  })

  it('computes chat cost estimates without blocking by default', async () => {
    const costEstimator = new CostEstimator({ caps: { single_operation_cap_usd: 0.000001 } })
    const orchestrator = new ChatOrchestrator({
      aiService: makeAIService(),
      costEstimator,
      indexService: { search: vi.fn().mockResolvedValue([]) },
    })

    const result = await orchestrator.chat('expensive query'.repeat(100), [], {
      type: 'library',
      description: 'entire library',
    }, {
      adapter: {},
      provider: 'claude',
      model: 'opus',
      chatCostGatesEnabled: false,
    })

    expect(result.provenance.cost_estimate_usd).toBeGreaterThan(0)
  })
})
