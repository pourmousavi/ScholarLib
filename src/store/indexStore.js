import { create } from 'zustand'

/**
 * Index Store - Manages indexing state and progress
 */
export const useIndexStore = create((set, get) => ({
  // Indexing state
  isIndexing: false,
  currentDocId: null,
  currentDocName: null,
  currentStage: null, // extracting | chunking | embedding | saving
  progress: 0,
  currentChunk: 0,
  totalChunks: 0,

  // Batch indexing state
  batchTotal: 0,
  batchCurrent: 0,
  batchMode: false,

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
    currentStage: progress.stage,
    currentDocId: progress.docId,
    progress: progress.progress || 0,
    currentChunk: progress.current || 0,
    totalChunks: progress.total || 0
  }),

  // Start indexing a document
  startIndexing: (docId, docName = null) => set({
    isIndexing: true,
    currentDocId: docId,
    currentDocName: docName,
    currentStage: 'extracting',
    progress: 0,
    error: null
  }),

  // Start batch indexing
  startBatchIndexing: (totalDocs) => set({
    batchMode: true,
    batchTotal: totalDocs,
    batchCurrent: 0,
    error: null
  }),

  // Update batch progress
  updateBatchProgress: (current) => set({
    batchCurrent: current
  }),

  // Complete indexing
  completeIndexing: (docId) => set((state) => ({
    isIndexing: state.queue.length > 0,
    currentDocId: null,
    currentDocName: null,
    currentStage: null,
    progress: 0,
    pendingDocs: state.pendingDocs.filter(id => id !== docId),
    indexedDocs: [...state.indexedDocs, docId]
  })),

  // Complete batch indexing
  completeBatchIndexing: () => set({
    batchMode: false,
    batchTotal: 0,
    batchCurrent: 0,
    isIndexing: false
  }),

  // Fail indexing
  failIndexing: (docId, error) => set({
    isIndexing: false,
    currentDocId: null,
    currentDocName: null,
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
    currentDocName: null,
    currentStage: null,
    progress: 0,
    currentChunk: 0,
    totalChunks: 0,
    batchMode: false,
    batchTotal: 0,
    batchCurrent: 0,
    pendingDocs: [],
    indexedDocs: [],
    queue: [],
    isProcessingQueue: false,
    error: null
  })
}))
