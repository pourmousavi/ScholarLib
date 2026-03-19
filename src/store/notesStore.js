import { create } from 'zustand'

/**
 * Notes Store - Manages notes state for the app
 *
 * The actual persistence is handled by NotesService.
 * This store provides reactive state for UI updates.
 */
export const useNotesStore = create((set, get) => ({
  // Current note being edited
  currentNote: null,
  currentDocId: null,

  // Auto-save status
  saveStatus: 'idle', // idle | saving | saved | error
  lastSavedAt: null,

  // Notes cache (loaded from storage)
  notesCache: {},
  isLoaded: false,

  // Set current note for editing
  setCurrentNote: (docId, note) => set({
    currentDocId: docId,
    currentNote: note,
    saveStatus: 'idle'
  }),

  // Update note content
  updateContent: (content) => set((state) => ({
    currentNote: state.currentNote
      ? { ...state.currentNote, content }
      : { content, tags: [] }
  })),

  // Update note tags
  updateTags: (tags) => set((state) => ({
    currentNote: state.currentNote
      ? { ...state.currentNote, tags }
      : { content: '', tags }
  })),

  // Set save status
  setSaveStatus: (status) => set({ saveStatus: status }),

  // Mark as saved
  markSaved: () => set({
    saveStatus: 'saved',
    lastSavedAt: new Date()
  }),

  // Mark as error
  markError: () => set({ saveStatus: 'error' }),

  // Set notes cache from storage
  setNotesCache: (notes) => set({
    notesCache: notes,
    isLoaded: true
  }),

  // Get note for a doc from cache
  getNoteFromCache: (docId) => {
    const { notesCache } = get()
    return notesCache[docId] || null
  },

  // Update cache entry
  updateCache: (docId, note) => set((state) => ({
    notesCache: {
      ...state.notesCache,
      [docId]: note
    }
  })),

  // Clear state (for logout)
  clear: () => set({
    currentNote: null,
    currentDocId: null,
    saveStatus: 'idle',
    lastSavedAt: null,
    notesCache: {},
    isLoaded: false
  })
}))
