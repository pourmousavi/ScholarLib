import { create } from 'zustand'

/**
 * AI Store - Manages AI provider state and chat
 */
export const useAIStore = create((set, get) => ({
  // Provider configuration
  provider: 'ollama', // ollama | webllm | claude | openai
  model: 'llama3.2',
  isAvailable: false,
  isChecking: true,

  // WebLLM specific
  webllmStatus: 'idle', // idle | downloading | ready | error
  webllmProgress: 0,
  webllmError: null,

  // Chat state
  messages: [],
  isStreaming: false,
  streamingContent: '',
  error: null,

  // Scope for RAG (Stage 11)
  scope: {
    type: 'document', // document | folder | library
    docId: null,
    folderId: null,
    description: 'current document',
    docCount: 1
  },

  // Provider actions
  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
  setAvailable: (isAvailable) => set({ isAvailable, isChecking: false }),
  setChecking: (isChecking) => set({ isChecking }),

  // WebLLM actions
  setWebLLMStatus: (status) => set({ webllmStatus: status }),
  setWebLLMProgress: (progress) => set({ webllmProgress: progress }),
  setWebLLMError: (error) => set({ webllmError: error, webllmStatus: 'error' }),

  // Scope actions
  setScope: (scope) => set({ scope }),
  setScopeType: (type, docId = null, folderId = null) => {
    const { scope } = get()
    set({
      scope: {
        ...scope,
        type,
        docId: type === 'document' ? docId : null,
        folderId: type === 'folder' ? folderId : null,
        description: type === 'document' ? 'current document'
          : type === 'folder' ? 'current folder'
          : 'entire library'
      }
    })
  },

  // Chat actions
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, {
      id: `m_${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...message
    }]
  })),

  updateLastMessage: (content) => set((state) => {
    const messages = [...state.messages]
    if (messages.length > 0) {
      messages[messages.length - 1] = {
        ...messages[messages.length - 1],
        content
      }
    }
    return { messages }
  }),

  setStreaming: (isStreaming) => set({ isStreaming }),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (chunk) => set((state) => ({
    streamingContent: state.streamingContent + chunk
  })),

  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  clearMessages: () => set({ messages: [], streamingContent: '' }),

  // Clear all state
  reset: () => set({
    messages: [],
    isStreaming: false,
    streamingContent: '',
    error: null,
    scope: {
      type: 'document',
      docId: null,
      folderId: null,
      description: 'current document',
      docCount: 1
    }
  })
}))
