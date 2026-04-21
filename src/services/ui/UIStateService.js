/**
 * Persists UI navigation state (selected folder, document, expanded folders)
 * to _system/ui_state.json on Box/Dropbox for cross-platform session restore.
 *
 * This is intentionally separate from library.json to avoid concurrency
 * conflicts — UI state uses last-write-wins, no schema_revision needed.
 */

const UI_STATE_PATH = '_system/ui_state.json'

const DEFAULTS = {
  selectedFolderId: null,
  selectedDocId: null,
  expandedFolders: [],
  lastUpdated: null,
}

const LS_KEY = 'sv_ui_state'

export const UIStateService = {
  /**
   * Load UI state from storage adapter, falling back to localStorage then defaults.
   */
  async load(adapter) {
    // Try remote (Box/Dropbox) first
    try {
      const remote = await adapter.readJSON(UI_STATE_PATH)
      // Cache to localStorage for fast same-device restore
      try { localStorage.setItem(LS_KEY, JSON.stringify(remote)) } catch {}
      return { ...DEFAULTS, ...remote }
    } catch (e) {
      if (e.code !== 'STORAGE_NOT_FOUND') {
        console.warn('Failed to load UI state from storage:', e)
      }
    }

    // Fall back to localStorage
    try {
      const cached = localStorage.getItem(LS_KEY)
      if (cached) return { ...DEFAULTS, ...JSON.parse(cached) }
    } catch {}

    return { ...DEFAULTS }
  },

  /**
   * Save UI state to storage adapter + localStorage.
   */
  async save(adapter, state) {
    const payload = {
      selectedFolderId: state.selectedFolderId ?? null,
      selectedDocId: state.selectedDocId ?? null,
      expandedFolders: state.expandedFolders ?? [],
      lastUpdated: new Date().toISOString(),
    }

    // Always update localStorage immediately
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)) } catch {}

    // Write to remote storage
    await adapter.writeJSON(UI_STATE_PATH, payload)
  },

  /**
   * Update localStorage cache only (used for instant same-device persistence
   * between the debounced remote saves).
   */
  cacheLocally(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        selectedFolderId: state.selectedFolderId ?? null,
        selectedDocId: state.selectedDocId ?? null,
        expandedFolders: state.expandedFolders ?? [],
        lastUpdated: new Date().toISOString(),
      }))
    } catch {}
  },
}
