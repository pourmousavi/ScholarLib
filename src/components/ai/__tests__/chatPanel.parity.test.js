import { describe, expect, it, vi } from 'vitest'
import { ChatOrchestrator } from '../../../services/ai/ChatOrchestrator'

const adapter = { name: 'memory' }

function makeOrchestrator({ chunks = [], indexed = true, provider = 'ollama' } = {}) {
  const calls = []
  const aiService = {
    buildSystemPrompt: vi.fn((scope, retrievedChunks, maxContextChars) => {
      const context = retrievedChunks
        .map(chunk => `[${chunk.citation}]\n${chunk.text}`)
        .join('\n\n')
      return `You are ScholarLib AI, an academic research assistant.
The user is reviewing ${scope.description}.
${retrievedChunks.length > 0 ? `${retrievedChunks.length} relevant excerpts from the document have been retrieved.` : 'No document context is currently loaded.'}
${context ? `\n\nRetrieved context:\n${context}` : ''}

Rules:
- Answer based on the retrieved context when available
- Cite sources as [Author Year] inline when referencing documents
- If the answer isn't in the context, you may use your general knowledge but note this
- Be concise and academically precise
- Format responses with markdown when helpful`
    }),
    estimateTokens: vi.fn((text) => Math.ceil(text.length / 4)),
    streamChat: vi.fn(async function* (messages, options) {
      calls.push({ messages, options })
      yield 'streamed answer with [Smith 2024]'
    }),
  }
  const indexService = {
    isIndexed: vi.fn().mockResolvedValue(indexed),
    search: vi.fn().mockResolvedValue(chunks),
  }
  return {
    orchestrator: new ChatOrchestrator({ aiService, indexService }),
    indexService,
    aiService,
    calls,
    provider,
  }
}

describe('ChatPanel parity contract via ChatOrchestrator', () => {
  it('document scope retrieves only selected document chunks with existing topK', async () => {
    const chunks = [
      { doc_id: 'doc-a', chunk_index: 0, score: 0.9, text: 'A only', citation: '[A 2024]' },
    ]
    const { orchestrator, indexService } = makeOrchestrator({ chunks })
    const result = await orchestrator.chat('query', [], { type: 'document', docId: 'doc-a', description: 'current document' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      selectedDocId: 'doc-a',
    })

    expect(indexService.search).toHaveBeenCalledWith(
      'query',
      expect.objectContaining({ type: 'document', docId: 'doc-a' }),
      adapter,
      6
    )
    expect(result.rag.chunks.map(chunk => chunk.doc_id)).toEqual(['doc-a'])
  })

  it('document scope on a non-indexed document surfaces the existing warning and skips search', async () => {
    const { orchestrator, indexService } = makeOrchestrator({ indexed: false })
    const result = await orchestrator.chat('query', [], { type: 'document', docId: 'doc-b', description: 'current document' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      selectedDocId: 'doc-b',
    })

    expect(result.rag.warning).toBe('This document has not been indexed yet. Click "Index for AI" to enable document-aware answers.')
    expect(indexService.search).not.toHaveBeenCalled()
  })

  it('folder scope preserves direct folder search semantics delegated to IndexService', async () => {
    const chunks = [
      { doc_id: 'doc-a', chunk_index: 0, score: 0.9, text: 'A', citation: '[A]' },
      { doc_id: 'doc-c', chunk_index: 0, score: 0.8, text: 'C', citation: '[C]' },
    ]
    const { orchestrator, indexService } = makeOrchestrator({ chunks })
    await orchestrator.chat('query', [], { type: 'folder', folderId: 'folder-1', description: 'current folder' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      selectedFolderId: 'folder-1',
    })

    expect(indexService.search.mock.calls[0][1]).toMatchObject({ type: 'folder', folderId: 'folder-1' })
  })

  it('tag scope passes tag filters and boolean mode through unchanged', async () => {
    const { orchestrator, indexService } = makeOrchestrator()
    await orchestrator.chat('query', [], {
      type: 'tags',
      tags: ['power-systems', 'bess'],
      tagMode: 'AND',
      description: 'documents with tags',
    }, { adapter, provider: 'ollama', model: 'llama3.2' })

    expect(indexService.search.mock.calls[0][1]).toMatchObject({
      type: 'tags',
      tags: ['power-systems', 'bess'],
      tagMode: 'AND',
    })
  })

  it('smart collection scope passes collection filters and boolean mode through unchanged', async () => {
    const { orchestrator, indexService } = makeOrchestrator()
    await orchestrator.chat('query', [], {
      type: 'collections',
      collections: ['recent-bess'],
      collectionMode: 'OR',
      description: 'documents in collections',
    }, { adapter, provider: 'ollama', model: 'llama3.2' })

    expect(indexService.search.mock.calls[0][1]).toMatchObject({
      type: 'collections',
      collections: ['recent-bess'],
      collectionMode: 'OR',
    })
  })

  it('library-wide retrieval uses the existing global topK', async () => {
    const { orchestrator, indexService } = makeOrchestrator()
    await orchestrator.chat('query', [], { type: 'library', description: 'entire library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
    })

    expect(indexService.search.mock.calls[0][1]).toMatchObject({ type: 'library' })
    expect(indexService.search.mock.calls[0][3]).toBe(6)
  })

  it('WebLLM keeps the smaller topK and prompt context budget', async () => {
    const { orchestrator, indexService, aiService } = makeOrchestrator()
    await orchestrator.chat('query', [], { type: 'library', description: 'entire library' }, {
      adapter,
      provider: 'webllm',
      model: 'browser-model',
    })

    expect(indexService.search.mock.calls[0][3]).toBe(3)
    expect(aiService.buildSystemPrompt.mock.calls[0][2]).toBe(6000)
  })

  it('cloud provider message format remains structurally equivalent', async () => {
    for (const provider of ['claude', 'openai', 'gemini']) {
      const { orchestrator } = makeOrchestrator({
        chunks: [{ doc_id: 'doc-a', chunk_index: 0, score: 0.9, text: 'context', citation: '[A]' }],
      })
      const result = await orchestrator.chat('same query', [{ role: 'assistant', content: 'prior answer' }], {
        type: 'library',
        description: 'entire library',
      }, { adapter, provider, model: `${provider}-model` })

      expect(result.messages.map(message => message.role)).toEqual(['system', 'assistant', 'user'])
      expect(result.messages[0].content).toContain('Retrieved context:')
      expect(result.messages[2]).toEqual({ role: 'user', content: 'same query' })
      expect(result.provenance.provider).toEqual({ name: provider, model: `${provider}-model` })
    }
  })

  it('citation context text is preserved in the system prompt', async () => {
    const { orchestrator } = makeOrchestrator({
      chunks: [{ doc_id: 'doc-a', chunk_index: 0, score: 0.9, text: 'cited content', citation: '[Smith 2024]' }],
    })
    const result = await orchestrator.chat('query', [], { type: 'library', description: 'entire library' }, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
    })

    expect(result.systemPrompt).toContain('[[Smith 2024]]')
  })
})
