import { create } from 'zustand'

/**
 * Index Store - Manages indexing state and progress
 */
export const useIndexStore = create((set, get) => ({
  // Indexing state
  isIndexing: false,
  currentDocId: null,
  currentStage: null, // extracting | chunking | embedding | saving
  progress: 0,
  currentChunk: 0,
  totalChunks: 0,

  // Pending documents
  pendingDocs: [],
  indexedDocs: [],

  // Queue management
  queue: [],
  isProcessingQueue: false,

  // Error state
  error: null,

  // Set indexing progress
  setProgress: (progress) => set({
    stage: progress.stage,
    currentDocId: progress.docId,
    progress: progress.progress || 0,
    currentChunk: progress.current || 0,
    totalChunks: progress.total || 0
  }),

  // Start indexing a document
  startIndexing: (docId) => set({
    isIndexing: true,
    currentDocId: docId,
    currentStage: 'extracting',
    progress: 0,
    error: null
  }),

  // Complete indexing
  completeIndexing: (docId) => set((state) => ({
    isIndexing: state.queue.length > 0,
    currentDocId: null,
    currentStage: null,
    progress: 0,
    pendingDocs: state.pendingDocs.filter(id => id !== docId),
    indexedDocs: [...state.indexedDocs, docId]
  })),

  // Fail indexing
  failIndexing: (docId, error) => set({
    isIndexing: false,
    currentDocId: null,
    currentStage: null,
    progress: 0,
    error: error?.message || 'Indexing failed'
  }),

  // Add to queue
  addToQueue: (docId) => set((state) => {
    if (state.queue.includes(docId)) return state
    return { queue: [...state.queue, docId] }
  }),

  // Remove from queue
  removeFromQueue: (docId) => set((state) => ({
    queue: state.queue.filter(id => id !== docId)
  })),

  // Set pending documents
  setPendingDocs: (docs) => set({ pendingDocs: docs }),

  // Set indexed documents
  setIndexedDocs: (docs) => set({ indexedDocs: docs }),

  // Clear error
  clearError: () => set({ error: null }),

  // Reset state
  reset: () => set({
    isIndexing: false,
    currentDocId: null,
    currentStage: null,
    progress: 0,
    currentChunk: 0,
    totalChunks: 0,
    pendingDocs: [],
    indexedDocs: [],
    queue: [],
    isProcessingQueue: false,
    error: null
  })
}))
