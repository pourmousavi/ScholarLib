import { describe, expect, it, vi } from 'vitest'
import { ChatOrchestrator } from '../ChatOrchestrator'
import { chatHistoryService } from '../ChatHistoryService'
import { MemoryAdapter } from '../../storage/MemoryAdapter'

describe('Phase 4 chat orchestration end-to-end', () => {
  it('streams through the refactored pipeline and stores provenance on new assistant messages', async () => {
    const adapter = new MemoryAdapter()
    const aiService = {
      buildSystemPrompt: vi.fn(() => 'system prompt with context'),
      estimateTokens: vi.fn(() => 100),
      streamChat: vi.fn(async function* () {
        yield 'hello '
        yield 'world'
      }),
    }
    const orchestrator = new ChatOrchestrator({
      aiService,
      indexService: {
        isIndexed: vi.fn().mockResolvedValue(true),
        search: vi.fn().mockResolvedValue([
          { doc_id: 'doc-1', chunk_index: 0, score: 0.88, text: 'context', citation: '[A 2024]' },
        ]),
      },
    })
    const scope = { type: 'document', docId: 'doc-1', description: 'current document' }
    const conversation = await chatHistoryService.createConversation(adapter, scope, 'llama3.2', 'ollama')
    await chatHistoryService.addMessage(adapter, conversation.id, { role: 'user', content: 'question' })

    const request = await orchestrator.chat('question', [], scope, {
      adapter,
      provider: 'ollama',
      model: 'llama3.2',
      selectedDocId: 'doc-1',
      conversationId: conversation.id,
    })

    let content = ''
    for await (const chunk of request.stream) content += chunk
    await chatHistoryService.addMessage(adapter, conversation.id, {
      role: 'assistant',
      content,
      provenance: request.provenance,
    })

    const saved = await chatHistoryService.getConversation(adapter, conversation.id)
    expect(saved.messages).toHaveLength(2)
    expect(saved.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'hello world',
      provenance: {
        classification: 'extractive',
        rag: { chunk_count: 1, doc_ids: ['doc-1'] },
        wiki: { page_count: 0, page_ids: [] },
      },
    })
  })

  it('loads old chat history records without provenance', async () => {
    const adapter = new MemoryAdapter({
      '_system/chat_history.json': {
        version: '1.0',
        conversations: [{
          id: 'old-conv',
          title: 'Old',
          scope: { type: 'library', description: 'entire library' },
          messages: [{ id: 'm1', role: 'assistant', content: 'old answer' }],
        }],
      },
    })

    const saved = await chatHistoryService.getConversation(adapter, 'old-conv')
    expect(saved.messages[0].provenance).toBeUndefined()
    expect(saved.messages[0].content).toBe('old answer')
  })

  it('performs synthetic sensitivity dry run before any model call', async () => {
    const aiService = {
      buildSystemPrompt: vi.fn(),
      streamChat: vi.fn(),
      estimateTokens: vi.fn(() => 1),
    }
    const orchestrator = new ChatOrchestrator({ aiService })

    await expect(orchestrator.chat('query', [], { type: 'library', description: 'entire library' }, {
      provider: 'gemini',
      model: 'gemini-model',
      sensitivity: 'confidential',
      allowedProviders: ['ollama'],
    })).rejects.toMatchObject({ code: 'CHAT_SENSITIVITY_REFUSED' })
    expect(aiService.streamChat).not.toHaveBeenCalled()
  })
})
