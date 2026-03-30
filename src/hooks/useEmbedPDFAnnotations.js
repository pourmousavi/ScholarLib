/**
 * useEmbedPDFAnnotations - Hook for managing PDF annotations with EmbedPDF
 *
 * Bridges EmbedPDF's annotation system with ScholarLib's AnnotationService
 * for persistence and the annotation store for reactive state.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnnotationStore } from '../store/annotationStore'
import { useStorageStore } from '../store/storageStore'
import {
  AnnotationService,
  ANNOTATION_COLORS,
  DEFAULT_HIGHLIGHT_COLOR,
  toEmbedPDFArray,
  fromEmbedPDF,
  fromEmbedPDFEvent
} from '../services/annotations'

/**
 * Hook for managing annotations in EmbedPDF viewer
 * @param {string} docId - Document ID
 * @param {Object} annotationApi - EmbedPDF annotation API from useAnnotation hook
 * @returns {Object} Annotation state and methods
 */
export function useEmbedPDFAnnotations(docId, annotationApi) {
  const adapter = useStorageStore((state) => state.adapter)
  const [isInitialized, setIsInitialized] = useState(false)
  const eventUnsubscribeRef = useRef(null)

  const {
    currentAnnotations,
    selectedAnnotationId,
    highlightColor,
    saveStatus,
    showAnnotationSidebar,
    isLoaded,
    setAnnotationsCache,
    setCurrentDoc,
    addAnnotation: storeAddAnnotation,
    updateAnnotation: storeUpdateAnnotation,
    deleteAnnotation: storeDeleteAnnotation,
    setSelectedAnnotation,
    setHighlightColor,
    setSaveStatus,
    toggleAnnotationSidebar,
    setAnnotationSidebar,
    getAnnotationsForPage,
    getAnnotationById
  } = useAnnotationStore()

  // Load annotations from storage on mount
  useEffect(() => {
    if (!adapter || isLoaded) return

    const loadAnnotations = async () => {
      try {
        const annotations = await AnnotationService.loadAnnotations(adapter)
        setAnnotationsCache(annotations)
      } catch (error) {
        console.error('Failed to load annotations:', error)
      }
    }

    loadAnnotations()
  }, [adapter, isLoaded, setAnnotationsCache])

  // Update current doc when docId changes
  useEffect(() => {
    if (docId) {
      setCurrentDoc(docId)
      setIsInitialized(false)
    }
  }, [docId, setCurrentDoc])

  // Import existing annotations into EmbedPDF when API is ready
  useEffect(() => {
    if (!annotationApi || !docId || isInitialized || !isLoaded) return

    // Debug: Log available annotation API methods
    console.log('[EmbedPDF Annotations] annotationApi available methods:',
      annotationApi ? Object.keys(annotationApi) : 'null')
    console.log('[EmbedPDF Annotations] annotationApi:', annotationApi)

    const existingAnnotations = AnnotationService.getAnnotationsForDoc(docId)
    if (existingAnnotations.length > 0) {
      try {
        // Convert to EmbedPDF format and import
        const embedAnnotations = toEmbedPDFArray(existingAnnotations)
        annotationApi.importAnnotations?.(embedAnnotations)
        console.log(`Imported ${embedAnnotations.length} annotations into EmbedPDF`)
      } catch (error) {
        console.error('Failed to import annotations into EmbedPDF:', error)
      }
    }

    setIsInitialized(true)
  }, [annotationApi, docId, isInitialized, isLoaded])

  // Subscribe to EmbedPDF annotation events
  useEffect(() => {
    if (!annotationApi || !adapter || !docId) return

    // Unsubscribe from previous if any
    if (eventUnsubscribeRef.current) {
      eventUnsubscribeRef.current()
    }

    const handleAnnotationEvent = (event) => {
      // Skip non-committed events (interim changes during editing)
      if (event.type === 'create' && !event.committed) return
      if (event.type === 'update' && !event.committed) return

      const converted = fromEmbedPDFEvent(event)

      switch (event.type) {
        case 'create':
          if (converted.annotation) {
            // Add to store
            storeAddAnnotation(converted.annotation)

            // Persist to storage
            AnnotationService.addAnnotation(adapter, docId, converted.annotation, {
              onSaveStart: () => setSaveStatus('saving'),
              onSaveComplete: () => setSaveStatus('saved'),
              onSaveError: () => setSaveStatus('error')
            })
          }
          break

        case 'update':
          if (event.annotationId && converted.patch) {
            // Update store
            storeUpdateAnnotation(event.annotationId, converted.patch)

            // Persist to storage
            AnnotationService.updateAnnotation(adapter, docId, event.annotationId, converted.patch, {
              onSaveStart: () => setSaveStatus('saving'),
              onSaveComplete: () => setSaveStatus('saved'),
              onSaveError: () => setSaveStatus('error')
            })
          }
          break

        case 'delete':
          if (event.annotationId) {
            // Remove from store
            storeDeleteAnnotation(event.annotationId)

            // Remove from storage
            AnnotationService.deleteAnnotation(adapter, docId, event.annotationId, {
              onSaveStart: () => setSaveStatus('saving'),
              onSaveComplete: () => setSaveStatus('saved'),
              onSaveError: () => setSaveStatus('error')
            })
          }
          break

        case 'select':
          if (event.annotationId) {
            setSelectedAnnotation(event.annotationId)
          }
          break

        case 'deselect':
          setSelectedAnnotation(null)
          break

        default:
          break
      }
    }

    // Subscribe to events
    eventUnsubscribeRef.current = annotationApi.onAnnotationEvent?.(handleAnnotationEvent)

    return () => {
      if (eventUnsubscribeRef.current) {
        eventUnsubscribeRef.current()
        eventUnsubscribeRef.current = null
      }
    }
  }, [
    annotationApi,
    adapter,
    docId,
    storeAddAnnotation,
    storeUpdateAnnotation,
    storeDeleteAnnotation,
    setSelectedAnnotation,
    setSaveStatus
  ])

  // Flush save when switching documents
  useEffect(() => {
    return () => {
      if (adapter) {
        AnnotationService.flushSave(adapter).catch(console.error)
      }
    }
  }, [docId, adapter])

  /**
   * Create a highlight annotation at the current selection
   */
  const createHighlight = useCallback((pageIndex, quadPoints, text = '') => {
    console.log('[EmbedPDF Annotations] createHighlight called:', { pageIndex, quadPoints, text })
    console.log('[EmbedPDF Annotations] annotationApi:', annotationApi)
    console.log('[EmbedPDF Annotations] annotationApi methods:', annotationApi ? Object.keys(annotationApi) : 'null')

    if (!annotationApi) {
      console.error('[EmbedPDF Annotations] No annotationApi available')
      return null
    }

    try {
      const result = annotationApi.createAnnotation?.(pageIndex, {
        type: 'highlight',
        quadPoints,
        color: { ...hexToRgbaInternal(highlightColor), a: 0.35 },
        contents: '',
        _scholarlib: {
          content: { text, image: null },
          tags: [],
          ai_context: { include_in_embeddings: true },
          source: 'user'
        }
      })
      console.log('[EmbedPDF Annotations] createAnnotation result:', result)
    } catch (error) {
      console.error('[EmbedPDF Annotations] createAnnotation failed:', error)
    }
  }, [annotationApi, highlightColor])

  /**
   * Create an underline annotation
   */
  const createUnderline = useCallback((pageIndex, quadPoints, text = '') => {
    if (!annotationApi) return null

    annotationApi.createAnnotation?.(pageIndex, {
      type: 'underline',
      quadPoints,
      color: { ...hexToRgbaInternal(highlightColor), a: 1 },
      contents: '',
      _scholarlib: {
        content: { text, image: null },
        tags: [],
        ai_context: { include_in_embeddings: true },
        source: 'user'
      }
    })
  }, [annotationApi, highlightColor])

  /**
   * Create an area/rectangle annotation
   */
  const createAreaAnnotation = useCallback((pageIndex, rect, imageData = null) => {
    if (!annotationApi) return null

    annotationApi.createAnnotation?.(pageIndex, {
      type: 'square',
      rect,
      color: { ...hexToRgbaInternal(highlightColor), a: 0.35 },
      contents: '',
      _scholarlib: {
        content: { text: '', image: imageData },
        tags: [],
        ai_context: { include_in_embeddings: true },
        source: 'user'
      }
    })
  }, [annotationApi, highlightColor])

  /**
   * Update annotation comment
   */
  const updateComment = useCallback((annotationId, comment) => {
    if (!annotationApi || !adapter || !docId) return false

    // Find the annotation to get its page
    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Update in EmbedPDF
    annotationApi.updateAnnotation?.(annotation.position?.page ?? 0, annotationId, {
      contents: comment
    })

    // Update in store and storage (will be triggered by event handler)
    return true
  }, [annotationApi, adapter, docId, getAnnotationById])

  /**
   * Update annotation color
   */
  const updateColor = useCallback((annotationId, color) => {
    if (!annotationApi || !adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Update in EmbedPDF
    annotationApi.updateAnnotation?.(annotation.position?.page ?? 0, annotationId, {
      color: { ...hexToRgbaInternal(color), a: 0.35 }
    })

    return true
  }, [annotationApi, adapter, docId, getAnnotationById])

  /**
   * Delete an annotation
   */
  const deleteAnnotation = useCallback((annotationId) => {
    if (!annotationApi || !adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Delete in EmbedPDF
    annotationApi.deleteAnnotation?.(annotation.position?.page ?? 0, annotationId)

    return true
  }, [annotationApi, adapter, docId, getAnnotationById])

  /**
   * Select an annotation
   */
  const selectAnnotation = useCallback((annotationId) => {
    if (!annotationApi) return

    const annotation = getAnnotationById(annotationId)
    if (annotation) {
      annotationApi.selectAnnotation?.(annotation.position?.page ?? 0, annotationId)
    }
    setSelectedAnnotation(annotationId)
  }, [annotationApi, getAnnotationById, setSelectedAnnotation])

  /**
   * Clear selection
   */
  const clearSelection = useCallback(() => {
    if (annotationApi && selectedAnnotationId) {
      const annotation = getAnnotationById(selectedAnnotationId)
      if (annotation) {
        annotationApi.deselectAnnotation?.(annotation.position?.page ?? 0, selectedAnnotationId)
      }
    }
    setSelectedAnnotation(null)
  }, [annotationApi, selectedAnnotationId, getAnnotationById, setSelectedAnnotation])

  /**
   * Get annotations for AI indexing
   */
  const getAnnotationsForAI = useCallback(() => {
    return AnnotationService.getAnnotationsForAI(docId)
  }, [docId])

  return {
    // State
    annotations: currentAnnotations,
    selectedAnnotationId,
    highlightColor,
    saveStatus,
    showAnnotationSidebar,
    isLoaded,
    isInitialized,

    // Constants
    COLORS: ANNOTATION_COLORS,
    DEFAULT_COLOR: DEFAULT_HIGHLIGHT_COLOR,

    // Getters
    getAnnotationsForPage,
    getAnnotationById,
    getAnnotationsForAI,
    annotationCount: currentAnnotations.length,

    // Creation methods
    createHighlight,
    createUnderline,
    createAreaAnnotation,

    // Update methods
    updateComment,
    updateColor,

    // Delete method
    deleteAnnotation,

    // Selection
    selectAnnotation,
    clearSelection,

    // Color control
    setColor: setHighlightColor,

    // Sidebar
    toggleSidebar: toggleAnnotationSidebar,
    setSidebar: setAnnotationSidebar
  }
}

// Internal helper for hex to RGBA conversion
function hexToRgbaInternal(hex, alpha = 1) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) {
    return { r: 255, g: 235, b: 59, a: alpha }
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: alpha
  }
}
