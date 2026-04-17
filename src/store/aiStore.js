import { create } from 'zustand'
import { getDeviceType, DEVICE_TYPES } from '../utils/deviceDetection'

// Get per-device AI settings from localStorage
const getDeviceSettings = () => {
  const deviceType = getDeviceType()
  const savedSettings = localStorage.getItem('sv_ai_device_settings')

  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings)
      return settings[deviceType] || getDefaultSettings(deviceType)
    } catch {
      // Fall back to defaults
    }
  }

  // Migration: check for old single-device settings
  const legacyProvider = localStorage.getItem('sv_ai_provider')
  const legacyModel = localStorage.getItem('sv_ai_model')
  if (legacyProvider) {
    return { provider: legacyProvider, model: legacyModel || 'llama3.2' }
  }

  return getDefaultSettings(deviceType)
}

// Default settings per device type
const getDefaultSettings = (deviceType) => {
  switch (deviceType) {
    case DEVICE_TYPES.MOBILE:
      return { provider: 'none', model: '' } // Disabled by default on mobile
    case DEVICE_TYPES.TABLET:
      return { provider: 'none', model: '' } // Disabled by default on tablet
    case DEVICE_TYPES.DESKTOP:
    default:
      return { provider: 'ollama', model: 'llama3.2' }
  }
}

// Save per-device settings
const saveDeviceSettings = (deviceType, provider, model) => {
  const savedSettings = localStorage.getItem('sv_ai_device_settings')
  let settings = {}

  if (savedSettings) {
    try {
      settings = JSON.parse(savedSettings)
    } catch {
      settings = {}
    }
  }

  settings[deviceType] = { provider, model }
  localStorage.setItem('sv_ai_device_settings', JSON.stringify(settings))
}

// Get all device settings for display in settings panel
const getAllDeviceSettings = () => {
  const savedSettings = localStorage.getItem('sv_ai_device_settings')
  let settings = {}

  if (savedSettings) {
    try {
      settings = JSON.parse(savedSettings)
    } catch {
      settings = {}
    }
  }

  // Fill in defaults for any missing device types
  for (const deviceType of Object.values(DEVICE_TYPES)) {
    if (!settings[deviceType]) {
      settings[deviceType] = getDefaultSettings(deviceType)
    }
  }

  return settings
}

// Embedding provider persistence (separate from chat provider)
const getEmbeddingProvider = () => {
  return localStorage.getItem('sv_embedding_provider') || 'browser'
}

const saveEmbeddingProvider = (provider) => {
  localStorage.setItem('sv_embedding_provider', provider)
}

const initialSettings = getDeviceSettings()

/**
 * AI Store - Manages AI provider state and chat
 * Supports per-device AI provider settings
 */
export const useAIStore = create((set, get) => ({
  // Current device type
  currentDeviceType: getDeviceType(),

  // Provider configuration - initialize from per-device localStorage
  provider: initialSettings.provider,
  model: initialSettings.model,
  isAvailable: false,
  isChecking: true,

  // Embedding provider (separate from chat - shared across devices)
  embeddingProvider: getEmbeddingProvider(),

  // All device settings (for settings panel)
  allDeviceSettings: getAllDeviceSettings(),

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

  // Provider actions - saves per-device
  setProvider: (provider) => {
    const deviceType = getDeviceType()
    const { model } = get()
    saveDeviceSettings(deviceType, provider, model)
    set({
      provider,
      allDeviceSettings: getAllDeviceSettings()
    })
  },
  setModel: (model) => {
    const deviceType = getDeviceType()
    const { provider } = get()
    saveDeviceSettings(deviceType, provider, model)
    set({
      model,
      allDeviceSettings: getAllDeviceSettings()
    })
  },
  setAvailable: (isAvailable) => set({ isAvailable, isChecking: false }),
  setChecking: (isChecking) => set({ isChecking }),

  // Embedding provider actions
  setEmbeddingProvider: (provider) => {
    saveEmbeddingProvider(provider)
    set({ embeddingProvider: provider })
  },

  // Per-device settings actions (for settings panel)
  setDeviceProvider: (deviceType, provider, model) => {
    saveDeviceSettings(deviceType, provider, model)
    const newAllSettings = getAllDeviceSettings()
    const currentDeviceType = getDeviceType()

    // If changing current device, update active provider too
    if (deviceType === currentDeviceType) {
      set({
        provider,
        model,
        allDeviceSettings: newAllSettings
      })
    } else {
      set({ allDeviceSettings: newAllSettings })
    }
  },

  getDeviceSettings: (deviceType) => {
    const { allDeviceSettings } = get()
    return allDeviceSettings[deviceType] || getDefaultSettings(deviceType)
  },

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
