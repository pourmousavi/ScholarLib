import { create } from 'zustand'
import { createStorageAdapter, getSavedProvider, saveProvider, clearProvider } from '../services/storage/StorageFactory'

export const useStorageStore = create((set, get) => ({
  provider: null,
  adapter: null,
  isConnected: false,
  isConnecting: false,
  isDemoMode: false,
  error: null,

  // Initialize on app load
  initialize: async () => {
    // Clear any stale OAuth session state from previous attempts
    sessionStorage.removeItem('pkce_verifier')
    sessionStorage.removeItem('oauth_state')

    const savedProvider = getSavedProvider()
    if (!savedProvider) {
      set({ isConnected: false })
      return
    }

    const adapter = createStorageAdapter(savedProvider)
    set({ provider: savedProvider, adapter, isConnecting: true })

    try {
      const connected = await adapter.isConnected()
      set({ isConnected: connected, isConnecting: false })
      if (!connected) {
        // Clear both provider and tokens when connection is invalid
        await adapter.disconnect()
        clearProvider()
        set({ provider: null, adapter: null })
      }
    } catch (error) {
      // Clear everything on error to allow fresh connection
      if (adapter && adapter.disconnect) {
        await adapter.disconnect()
      }
      clearProvider()
      set({ provider: null, adapter: null, isConnected: false, isConnecting: false, error: error.message })
    }
  },

  // Select provider and start OAuth
  selectProvider: (provider) => {
    const adapter = createStorageAdapter(provider)
    set({ provider, adapter, isConnecting: true, error: null })
    saveProvider(provider)
    adapter.connect()
  },

  // Handle OAuth callback
  handleCallback: async (code, state) => {
    let { adapter, provider } = get()

    // If no adapter, try to determine provider from URL and create one
    if (!adapter) {
      const url = new URL(window.location.href)
      if (url.pathname.includes('/auth/dropbox')) {
        provider = 'dropbox'
      } else if (url.pathname.includes('/auth/box') || url.pathname.endsWith('/ScholarLib/')) {
        provider = 'box'
      }

      if (provider) {
        adapter = createStorageAdapter(provider)
        saveProvider(provider)
        set({ provider, adapter })
      } else {
        throw new Error('No storage adapter initialized')
      }
    }

    set({ isConnecting: true, error: null })

    try {
      await adapter.handleCallback(code, state)
      set({ isConnected: true, isConnecting: false })
    } catch (error) {
      // Clear tokens and provider on callback failure
      if (adapter && adapter.disconnect) {
        await adapter.disconnect()
      }
      clearProvider()
      set({ provider: null, adapter: null, isConnected: false, isConnecting: false, error: error.message })
      throw error
    }
  },

  // Disconnect
  disconnect: async () => {
    const { adapter } = get()
    if (adapter) {
      await adapter.disconnect()
    }
    clearProvider()
    set({ provider: null, adapter: null, isConnected: false, error: null })
  },

  // Get adapter for use in other services
  getAdapter: () => {
    const { adapter, isConnected } = get()
    if (!adapter || !isConnected) {
      return null
    }
    return adapter
  },

  // Enable demo mode (skip storage, use mock data)
  enableDemoMode: () => {
    set({ isDemoMode: true, isConnected: true, provider: 'demo' })
  },

  // Exit demo mode
  exitDemoMode: () => {
    set({ isDemoMode: false, isConnected: false, provider: null, adapter: null })
  },
}))
