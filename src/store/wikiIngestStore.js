import { create } from 'zustand'

/**
 * Tracks progress of "Ingest into Wiki" / "Ingest as grant into Wiki" so the
 * doc-list footer can show a progress bar (mirrors useIndexStore's role for
 * AI indexing).
 *
 * Stages:
 *   paper  → preparing → extracting → building → complete
 *   grant  → preparing → extracting → writing  → complete
 */
export const useWikiIngestStore = create((set) => ({
  isIngesting: false,
  mode: null, // 'paper' | 'grant'
  currentDocId: null,
  currentDocName: null,
  currentStage: null,
  error: null,

  startIngest: ({ mode, docId, docName }) => set({
    isIngesting: true,
    mode,
    currentDocId: docId,
    currentDocName: docName,
    currentStage: 'preparing',
    error: null,
  }),

  setStage: (stage) => set({ currentStage: stage }),

  completeIngest: () => set({
    isIngesting: false,
    mode: null,
    currentDocId: null,
    currentDocName: null,
    currentStage: null,
    error: null,
  }),

  failIngest: (error) => set({
    isIngesting: false,
    mode: null,
    currentDocId: null,
    currentDocName: null,
    currentStage: null,
    error: error?.message || String(error || 'Wiki ingestion failed'),
  }),

  clearError: () => set({ error: null }),
}))
