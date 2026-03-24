import { create } from 'zustand'
import { DEFAULT_HIGHLIGHT_COLOR } from '../services/annotations'

/**
 * Annotation Store - Manages annotation state for the app
 *
 * The actual persistence is handled by AnnotationService.
 * This store provides reactive state for UI updates.
 */
export const useAnnotationStore = create((set, get) => ({
  // Annotations cache (loaded from storage)
  annotationsCache: {},
  isLoaded: false,

  // Current document's annotations
  currentDocId: null,
  currentAnnotations: [],

  // Selection state
  selectedAnnotationId: null,

  // Annotation mode
  annotationMode: null, // null | 'highlight' | 'area' | 'underline'
  highlightColor: DEFAULT_HIGHLIGHT_COLOR,

  // Save status
  saveStatus: 'idle', // idle | saving | saved | error

  // Sidebar visibility
  showAnnotationSidebar: false,

  // Text selection state (for creating highlights)
  textSelection: null, // { text, rects, page, boundingRect }

  /**
   * Set annotations cache from storage
   */
  setAnnotationsCache: (annotations) => set({
    annotationsCache: annotations,
    isLoaded: true
  }),

  /**
   * Set current document and load its annotations
   */
  setCurrentDoc: (docId) => {
    const { annotationsCache } = get()
    set({
      currentDocId: docId,
      currentAnnotations: annotationsCache[docId] || [],
      selectedAnnotationId: null
    })
  },

  /**
   * Add annotation to current document
   */
  addAnnotation: (annotation) => set((state) => {
    const docId = state.currentDocId
    if (!docId) return state

    const newAnnotations = [...state.currentAnnotations, annotation]
    return {
      currentAnnotations: newAnnotations,
      annotationsCache: {
        ...state.annotationsCache,
        [docId]: newAnnotations
      },
      selectedAnnotationId: annotation.id
    }
  }),

  /**
   * Update annotation in current document
   */
  updateAnnotation: (annotationId, updates) => set((state) => {
    const docId = state.currentDocId
    if (!docId) return state

    const newAnnotations = state.currentAnnotations.map(a =>
      a.id === annotationId
        ? { ...a, ...updates, updated_at: new Date().toISOString() }
        : a
    )

    return {
      currentAnnotations: newAnnotations,
      annotationsCache: {
        ...state.annotationsCache,
        [docId]: newAnnotations
      }
    }
  }),

  /**
   * Delete annotation from current document
   */
  deleteAnnotation: (annotationId) => set((state) => {
    const docId = state.currentDocId
    if (!docId) return state

    const newAnnotations = state.currentAnnotations.filter(a => a.id !== annotationId)

    const newCache = { ...state.annotationsCache }
    if (newAnnotations.length === 0) {
      delete newCache[docId]
    } else {
      newCache[docId] = newAnnotations
    }

    return {
      currentAnnotations: newAnnotations,
      annotationsCache: newCache,
      selectedAnnotationId: state.selectedAnnotationId === annotationId
        ? null
        : state.selectedAnnotationId
    }
  }),

  /**
   * Select an annotation
   */
  setSelectedAnnotation: (annotationId) => set({
    selectedAnnotationId: annotationId
  }),

  /**
   * Set annotation mode
   */
  setAnnotationMode: (mode) => set({
    annotationMode: mode
  }),

  /**
   * Set highlight color
   */
  setHighlightColor: (color) => set({
    highlightColor: color
  }),

  /**
   * Set save status
   */
  setSaveStatus: (status) => set({
    saveStatus: status
  }),

  /**
   * Toggle annotation sidebar
   */
  toggleAnnotationSidebar: () => set((state) => ({
    showAnnotationSidebar: !state.showAnnotationSidebar
  })),

  /**
   * Set annotation sidebar visibility
   */
  setAnnotationSidebar: (show) => set({
    showAnnotationSidebar: show
  }),

  /**
   * Set text selection (from PDF text layer)
   */
  setTextSelection: (selection) => set({
    textSelection: selection
  }),

  /**
   * Clear text selection
   */
  clearTextSelection: () => set({
    textSelection: null
  }),

  /**
   * Get annotations for a specific page
   */
  getAnnotationsForPage: (pageNumber) => {
    const { currentAnnotations } = get()
    return currentAnnotations.filter(a => a.position?.page === pageNumber)
  },

  /**
   * Get annotation by ID
   */
  getAnnotationById: (annotationId) => {
    const { currentAnnotations } = get()
    return currentAnnotations.find(a => a.id === annotationId)
  },

  /**
   * Bulk import annotations for a document
   */
  importAnnotations: (docId, annotations) => set((state) => {
    const existingAnnotations = state.annotationsCache[docId] || []
    const newAnnotations = [...existingAnnotations, ...annotations]

    const isCurrent = state.currentDocId === docId

    return {
      annotationsCache: {
        ...state.annotationsCache,
        [docId]: newAnnotations
      },
      currentAnnotations: isCurrent ? newAnnotations : state.currentAnnotations
    }
  }),

  /**
   * Clear state (for logout)
   */
  clear: () => set({
    annotationsCache: {},
    isLoaded: false,
    currentDocId: null,
    currentAnnotations: [],
    selectedAnnotationId: null,
    annotationMode: null,
    highlightColor: DEFAULT_HIGHLIGHT_COLOR,
    saveStatus: 'idle',
    showAnnotationSidebar: false,
    textSelection: null
  })
}))
