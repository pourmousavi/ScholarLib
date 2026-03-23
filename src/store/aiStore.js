import { create } from 'zustand'

// Read initial values from localStorage
const getInitialProvider = () => localStorage.getItem('sv_ai_provider') || 'ollama'
const getInitialModel = () => localStorage.getItem('sv_ai_model') || 'llama3.2'

/**
 * AI Store - Manages AI provider state and chat
 */
export const useAIStore = create((set, get) => ({
  // Provider configuration - initialize from localStorage
  provider: getInitialProvider(),
  model: getInitialModel(),
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

  // Conversation tracking (for history)
  currentConversationId: null,
  conversationTitle: null,

  // Scope for RAG (Stage 11)
  scope: {
    type: 'document', // document | folder | library | tags | collections
    docId: null,
    folderId: null,
    tags: [],
    tagMode: 'AND', // AND | OR
    collections: [],
    collectionMode: 'AND', // AND | OR
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
        tags: type === 'tags' ? scope.tags : [],
        tagMode: type === 'tags' ? scope.tagMode : 'AND',
        collections: type === 'collections' ? scope.collections : [],
        collectionMode: type === 'collections' ? scope.collectionMode : 'AND',
        description: type === 'document' ? 'current document'
          : type === 'folder' ? 'current folder'
          : type === 'tags' ? 'documents with tags'
          : type === 'collections' ? 'documents in collections'
          : 'entire library'
      }
    })
  },

  // Tag scope actions
  setScopeTags: (tags) => {
    const { scope } = get()
    set({
      scope: {
        ...scope,
        type: 'tags',
        tags,
        description: `documents with ${tags.length} tag${tags.length !== 1 ? 's' : ''}`
      }
    })
  },

  toggleScopeTag: (slug) => {
    const { scope } = get()
    const currentTags = scope.tags || []
    const newTags = currentTags.includes(slug)
      ? currentTags.filter(t => t !== slug)
      : [...currentTags, slug]
    set({
      scope: {
        ...scope,
        type: 'tags',
        tags: newTags,
        description: newTags.length > 0
          ? `documents with ${newTags.length} tag${newTags.length !== 1 ? 's' : ''}`
          : 'select tags'
      }
    })
  },

  setScopeTagMode: (mode) => {
    const { scope } = get()
    set({
      scope: {
        ...scope,
        tagMode: mode
      }
    })
  },

  clearScopeTags: () => {
    const { scope } = get()
    set({
      scope: {
        ...scope,
        type: 'library',
        tags: [],
        tagMode: 'AND',
        description: 'entire library'
      }
    })
  },

  // Collection scope actions
  setScopeCollections: (collections) => {
    const { scope } = get()
    set({
      scope: {
        ...scope,
        type: 'collections',
        collections,
        description: `documents in ${collections.length} collection${collections.length !== 1 ? 's' : ''}`
      }
    })
  },

  toggleScopeCollection: (slug) => {
    const { scope } = get()
    const currentCollections = scope.collections || []
    const newCollections = currentCollections.includes(slug)
      ? currentCollections.filter(c => c !== slug)
      : [...currentCollections, slug]
    set({
      scope: {
        ...scope,
        type: 'collections',
        collections: newCollections,
        description: newCollections.length > 0
          ? `documents in ${newCollections.length} collection${newCollections.length !== 1 ? 's' : ''}`
          : 'select collections'
      }
    })
  },

  setScopeCollectionMode: (mode) => {
    const { scope } = get()
    set({
      scope: {
        ...scope,
        collectionMode: mode
      }
    })
  },

  clearScopeCollections: () => {
    const { scope } = get()
    set({
      scope: {
        ...scope,
        type: 'library',
        collections: [],
        collectionMode: 'AND',
        description: 'entire library'
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

  // Conversation actions
  setCurrentConversation: (id, title = null) => set({
    currentConversationId: id,
    conversationTitle: title
  }),

  setConversationTitle: (title) => set({ conversationTitle: title }),

  loadConversation: (conversation) => set({
    currentConversationId: conversation.id,
    conversationTitle: conversation.title,
    messages: conversation.messages || [],
    scope: conversation.scope || {
      type: 'document',
      docId: null,
      folderId: null,
      tags: [],
      tagMode: 'AND',
      collections: [],
      collectionMode: 'AND',
      description: 'current document',
      docCount: 1
    }
  }),

  startNewConversation: () => set({
    currentConversationId: null,
    conversationTitle: null,
    messages: [],
    streamingContent: '',
    error: null
  }),

  // Clear all state
  reset: () => set({
    messages: [],
    isStreaming: false,
    streamingContent: '',
    error: null,
    currentConversationId: null,
    conversationTitle: null,
    scope: {
      type: 'document',
      docId: null,
      folderId: null,
      tags: [],
      tagMode: 'AND',
      collections: [],
      collectionMode: 'AND',
      description: 'current document',
      docCount: 1
    }
  })
}))
