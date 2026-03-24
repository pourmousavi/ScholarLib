import { useCallback, useEffect } from 'react'
import { useAnnotationStore } from '../store/annotationStore'
import { useStorageStore } from '../store/storageStore'
import { AnnotationService, ANNOTATION_COLORS, DEFAULT_HIGHLIGHT_COLOR } from '../services/annotations'

/**
 * useAnnotations - Hook for managing PDF annotations
 *
 * Provides annotation CRUD operations with automatic persistence
 * and reactive state updates.
 *
 * @param {string} docId - Document ID to load annotations for
 * @returns {Object} Annotation state and methods
 */
export function useAnnotations(docId) {
  const adapter = useStorageStore((state) => state.adapter)

  const {
    currentAnnotations,
    selectedAnnotationId,
    annotationMode,
    highlightColor,
    saveStatus,
    showAnnotationSidebar,
    textSelection,
    isLoaded,
    setAnnotationsCache,
    setCurrentDoc,
    addAnnotation: storeAddAnnotation,
    updateAnnotation: storeUpdateAnnotation,
    deleteAnnotation: storeDeleteAnnotation,
    setSelectedAnnotation,
    setAnnotationMode,
    setHighlightColor,
    setSaveStatus,
    toggleAnnotationSidebar,
    setAnnotationSidebar,
    setTextSelection,
    clearTextSelection,
    getAnnotationsForPage,
    getAnnotationById,
    importAnnotations: storeImportAnnotations
  } = useAnnotationStore()

  // Load annotations on mount
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
    }
  }, [docId, setCurrentDoc])

  // Flush save when switching documents
  useEffect(() => {
    return () => {
      if (adapter) {
        AnnotationService.flushSave(adapter).catch(console.error)
      }
    }
  }, [docId, adapter])

  /**
   * Create a highlight annotation from text selection
   *
   * Coordinates are normalized to PDF units (scale=1) for storage,
   * so they render correctly at any zoom level.
   */
  const createHighlight = useCallback((selection, options = {}) => {
    if (!adapter || !docId) return null

    // Get current scale from selection (passed from PDFViewer)
    const scale = selection.scale || 1

    // Normalize coordinates to PDF units (divide by scale)
    const normalizeRect = (rect) => ({
      x1: rect.x1 / scale,
      y1: rect.y1 / scale,
      x2: rect.x2 / scale,
      y2: rect.y2 / scale,
      width: rect.width / scale,
      height: rect.height / scale
    })

    const normalizedRects = selection.rects.map(normalizeRect)
    const normalizedBoundingRect = selection.boundingRect ? {
      x1: selection.boundingRect.x1 / scale,
      y1: selection.boundingRect.y1 / scale,
      x2: selection.boundingRect.x2 / scale,
      y2: selection.boundingRect.y2 / scale
    } : null

    const annotation = AnnotationService.createAnnotation(
      'highlight',
      {
        page: selection.page,
        rects: normalizedRects,
        boundingRect: normalizedBoundingRect
      },
      {
        text: selection.text,
        image: null
      },
      {
        color: options.color || highlightColor,
        comment: options.comment || '',
        tags: options.tags || [],
        source: 'user'
      }
    )

    // Update store
    storeAddAnnotation(annotation)

    // Persist to storage
    AnnotationService.addAnnotation(adapter, docId, annotation, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    clearTextSelection()
    return annotation
  }, [adapter, docId, highlightColor, storeAddAnnotation, setSaveStatus, clearTextSelection])

  /**
   * Create an area annotation (rectangle selection)
   */
  const createAreaAnnotation = useCallback((position, imageData, options = {}) => {
    if (!adapter || !docId) return null

    const annotation = AnnotationService.createAnnotation(
      'area',
      position,
      {
        text: '',
        image: imageData
      },
      {
        color: options.color || highlightColor,
        comment: options.comment || '',
        tags: options.tags || [],
        source: 'user'
      }
    )

    storeAddAnnotation(annotation)

    AnnotationService.addAnnotation(adapter, docId, annotation, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return annotation
  }, [adapter, docId, highlightColor, storeAddAnnotation, setSaveStatus])

  /**
   * Create a standalone note annotation
   */
  const createNote = useCallback((page, position, comment) => {
    if (!adapter || !docId) return null

    const annotation = AnnotationService.createAnnotation(
      'note',
      {
        page,
        rects: [],
        boundingRect: position
      },
      {
        text: '',
        image: null
      },
      {
        color: highlightColor,
        comment,
        source: 'user'
      }
    )

    storeAddAnnotation(annotation)

    AnnotationService.addAnnotation(adapter, docId, annotation, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return annotation
  }, [adapter, docId, highlightColor, storeAddAnnotation, setSaveStatus])

  /**
   * Update annotation comment
   */
  const updateComment = useCallback((annotationId, comment) => {
    if (!adapter || !docId) return false

    storeUpdateAnnotation(annotationId, { comment })

    AnnotationService.updateAnnotation(adapter, docId, annotationId, { comment }, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [adapter, docId, storeUpdateAnnotation, setSaveStatus])

  /**
   * Update annotation color
   */
  const updateColor = useCallback((annotationId, color) => {
    if (!adapter || !docId) return false

    storeUpdateAnnotation(annotationId, { color })

    AnnotationService.updateAnnotation(adapter, docId, annotationId, { color }, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [adapter, docId, storeUpdateAnnotation, setSaveStatus])

  /**
   * Update annotation tags
   */
  const updateTags = useCallback((annotationId, tags) => {
    if (!adapter || !docId) return false

    storeUpdateAnnotation(annotationId, { tags })

    AnnotationService.updateAnnotation(adapter, docId, annotationId, { tags }, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [adapter, docId, storeUpdateAnnotation, setSaveStatus])

  /**
   * Toggle AI context inclusion
   */
  const toggleAIContext = useCallback((annotationId, include) => {
    if (!adapter || !docId) return false

    const ai_context = { include_in_embeddings: include }
    storeUpdateAnnotation(annotationId, { ai_context })

    AnnotationService.updateAnnotation(adapter, docId, annotationId, { ai_context }, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [adapter, docId, storeUpdateAnnotation, setSaveStatus])

  /**
   * Delete an annotation
   */
  const deleteAnnotation = useCallback((annotationId) => {
    if (!adapter || !docId) return false

    storeDeleteAnnotation(annotationId)

    AnnotationService.deleteAnnotation(adapter, docId, annotationId, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [adapter, docId, storeDeleteAnnotation, setSaveStatus])

  /**
   * Import annotations (from Zotero or PDF extraction)
   */
  const importAnnotations = useCallback(async (annotations) => {
    if (!adapter || !docId) return false

    try {
      setSaveStatus('saving')
      await AnnotationService.importAnnotations(adapter, docId, annotations, {
        onSaveComplete: () => setSaveStatus('saved'),
        onSaveError: () => setSaveStatus('error')
      })
      storeImportAnnotations(docId, annotations)
      return true
    } catch (error) {
      console.error('Failed to import annotations:', error)
      setSaveStatus('error')
      return false
    }
  }, [adapter, docId, storeImportAnnotations, setSaveStatus])

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
    annotationMode,
    highlightColor,
    saveStatus,
    showAnnotationSidebar,
    textSelection,
    isLoaded,

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
    createAreaAnnotation,
    createNote,

    // Update methods
    updateComment,
    updateColor,
    updateTags,
    toggleAIContext,

    // Delete method
    deleteAnnotation,

    // Bulk import
    importAnnotations,

    // Selection
    selectAnnotation: setSelectedAnnotation,
    clearSelection: () => setSelectedAnnotation(null),

    // Mode control
    setMode: setAnnotationMode,
    clearMode: () => setAnnotationMode(null),
    setColor: setHighlightColor,

    // Sidebar
    toggleSidebar: toggleAnnotationSidebar,
    setSidebar: setAnnotationSidebar,

    // Text selection
    setTextSelection,
    clearTextSelection
  }
}
