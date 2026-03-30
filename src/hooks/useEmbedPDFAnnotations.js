/**
 * useEmbedPDFAnnotations - Hook for managing PDF annotations with EmbedPDF
 *
 * Bridges EmbedPDF's annotation system with ScholarLib's AnnotationService
 * for persistence and the annotation store for reactive state.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
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
 * @param {Object} annotationScope - EmbedPDF annotation scope from useAnnotation hook (for createAnnotation, etc.)
 * @param {Object} annotationCapability - EmbedPDF annotation capability from useAnnotationCapability hook (for onAnnotationEvent)
 * @returns {Object} Annotation state and methods
 */
export function useEmbedPDFAnnotations(docId, annotationScope, annotationCapability) {
  const adapter = useStorageStore((state) => state.adapter)
  const [isInitialized, setIsInitialized] = useState(false)
  const eventUnsubscribeRef = useRef(null)
  // Track annotations we've created directly to avoid duplicates from events
  const createdAnnotationIds = useRef(new Set())

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
    if (!annotationScope || !docId || isInitialized || !isLoaded) return

    const existingAnnotations = AnnotationService.getAnnotationsForDoc(docId)

    if (existingAnnotations.length > 0) {
      try {
        // Track all imported annotation IDs to prevent duplicate handling from create events
        existingAnnotations.forEach(ann => {
          createdAnnotationIds.current.add(ann.id)
        })

        // Convert to EmbedPDF format and import
        const embedAnnotations = toEmbedPDFArray(existingAnnotations)

        // EmbedPDF importAnnotations expects ImportAnnotationItem[] format
        // where each item is { annotation: T, ctx?: AnnotationCreateContext<T> }
        const importItems = embedAnnotations.map(ann => ({ annotation: ann }))
        annotationScope.importAnnotations?.(importItems)
      } catch (error) {
        console.error('Failed to import annotations:', error)
      }
    }

    setIsInitialized(true)
  }, [annotationScope, docId, isInitialized, isLoaded])

  // Subscribe to EmbedPDF annotation events (using capability for global events)
  useEffect(() => {
    if (!annotationCapability || !adapter || !docId) return

    // Unsubscribe from previous if any
    if (eventUnsubscribeRef.current) {
      eventUnsubscribeRef.current()
    }

    const handleAnnotationEvent = (event) => {
      // Skip non-committed create/update events (interim changes during editing)
      if ((event.type === 'create' || event.type === 'update') && !event.committed) {
        return
      }

      const converted = fromEmbedPDFEvent(event)

      switch (event.type) {
        case 'create':
          // Skip if we already created this annotation directly (avoid duplicates)
          if (converted.annotation && createdAnnotationIds.current.has(converted.annotation.id)) {
            createdAnnotationIds.current.delete(converted.annotation.id)
            return
          }
          if (converted.annotation) {
            storeAddAnnotation(converted.annotation)
            AnnotationService.addAnnotation(adapter, docId, converted.annotation, {
              onSaveStart: () => setSaveStatus('saving'),
              onSaveComplete: () => setSaveStatus('saved'),
              onSaveError: () => setSaveStatus('error')
            })
          }
          break

        case 'update':
          if (event.annotationId && converted.patch) {
            storeUpdateAnnotation(event.annotationId, converted.patch)
            AnnotationService.updateAnnotation(adapter, docId, event.annotationId, converted.patch, {
              onSaveStart: () => setSaveStatus('saving'),
              onSaveComplete: () => setSaveStatus('saved'),
              onSaveError: () => setSaveStatus('error')
            })
          }
          break

        case 'delete':
          if (event.annotationId) {
            storeDeleteAnnotation(event.annotationId)
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
      }
    }

    eventUnsubscribeRef.current = annotationCapability.onAnnotationEvent?.(handleAnnotationEvent)

    return () => {
      if (eventUnsubscribeRef.current) {
        eventUnsubscribeRef.current()
        eventUnsubscribeRef.current = null
      }
    }
  }, [
    annotationCapability,
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
   * @param {number} pageIndex - The page index (0-based)
   * @param {Array} selectionData - The selection data from getFormattedSelection()
   * @param {string} text - The selected text
   */
  const createHighlight = useCallback((pageIndex, selectionData, text = '') => {
    if (!annotationScope) return null

    try {
      // Extract segmentRects from selection data
      const rawRects = selectionData.flatMap(item => item.segmentRects || [])
      if (rawRects.length === 0) return null

      // Ensure rects are in correct format: { origin: { x, y }, size: { width, height } }
      const segmentRects = rawRects.map(rect => {
        if (rect.origin && rect.size) return rect
        if ('x' in rect && 'y' in rect && 'width' in rect && 'height' in rect) {
          return { origin: { x: rect.x, y: rect.y }, size: { width: rect.width, height: rect.height } }
        }
        if ('x1' in rect && 'y1' in rect && 'x2' in rect && 'y2' in rect) {
          return { origin: { x: rect.x1, y: rect.y1 }, size: { width: rect.x2 - rect.x1, height: rect.y2 - rect.y1 } }
        }
        return rect
      })

      // Get or compute bounding rect
      let boundingRect = selectionData[0]?.rect
      if (!boundingRect && segmentRects.length > 0) {
        const minX = Math.min(...segmentRects.map(r => r.origin.x))
        const minY = Math.min(...segmentRects.map(r => r.origin.y))
        const maxX = Math.max(...segmentRects.map(r => r.origin.x + r.size.width))
        const maxY = Math.max(...segmentRects.map(r => r.origin.y + r.size.height))
        boundingRect = { origin: { x: minX, y: minY }, size: { width: maxX - minX, height: maxY - minY } }
      }

      const annotationId = `ann_${nanoid(10)}`
      const now = new Date().toISOString()

      // Track this ID to avoid duplicate from event handler
      createdAnnotationIds.current.add(annotationId)

      // Create in EmbedPDF for visual rendering
      const embedAnnotation = {
        id: annotationId,
        type: 9, // HIGHLIGHT
        pageIndex,
        rect: boundingRect,
        segmentRects,
        strokeColor: highlightColor,
        opacity: 0.35,
        contents: typeof text === 'string' ? text : ''
      }
      annotationScope.createAnnotation?.(pageIndex, embedAnnotation)

      // Save to store and storage
      const scholarAnnotation = {
        id: annotationId,
        type: 'highlight',
        color: highlightColor,
        created_at: now,
        updated_at: now,
        position: {
          page: pageIndex,
          rects: segmentRects.map(r => ({
            x1: r.origin.x, y1: r.origin.y,
            x2: r.origin.x + r.size.width, y2: r.origin.y + r.size.height
          })),
          boundingRect: boundingRect ? {
            x1: boundingRect.origin.x, y1: boundingRect.origin.y,
            x2: boundingRect.origin.x + boundingRect.size.width, y2: boundingRect.origin.y + boundingRect.size.height
          } : null
        },
        content: { text: typeof text === 'string' ? text : '', image: null },
        comment: '',
        tags: [],
        ai_context: { include_in_embeddings: true },
        source: 'user'
      }

      storeAddAnnotation(scholarAnnotation)

      if (adapter && docId) {
        AnnotationService.addAnnotation(adapter, docId, scholarAnnotation, {
          onSaveStart: () => setSaveStatus('saving'),
          onSaveComplete: () => setSaveStatus('saved'),
          onSaveError: () => setSaveStatus('error')
        })
      }

      return true
    } catch (error) {
      console.error('Failed to create highlight:', error)
      return null
    }
  }, [annotationScope, highlightColor, adapter, docId, storeAddAnnotation, setSaveStatus])

  /**
   * Create an underline annotation
   * @param {number} pageIndex - The page index (0-based)
   * @param {Array} selectionData - The selection data from getFormattedSelection()
   * @param {string} text - The selected text
   */
  const createUnderline = useCallback((pageIndex, selectionData, text = '') => {
    if (!annotationScope) return null

    try {
      const rawRects = selectionData.flatMap(item => item.segmentRects || [])
      if (rawRects.length === 0) return null

      // Ensure rects are in correct format: { origin: { x, y }, size: { width, height } }
      const segmentRects = rawRects.map(rect => {
        if (rect.origin && rect.size) return rect
        if ('x' in rect && 'y' in rect && 'width' in rect && 'height' in rect) {
          return {
            origin: { x: rect.x, y: rect.y },
            size: { width: rect.width, height: rect.height }
          }
        }
        if ('x1' in rect && 'y1' in rect && 'x2' in rect && 'y2' in rect) {
          return {
            origin: { x: rect.x1, y: rect.y1 },
            size: { width: rect.x2 - rect.x1, height: rect.y2 - rect.y1 }
          }
        }
        return rect
      })

      // Get the bounding rect from selection data - EmbedPDF requires this
      let boundingRect = selectionData[0]?.rect
      if (!boundingRect && segmentRects.length > 0) {
        // Compute bounding rect from segmentRects
        const minX = Math.min(...segmentRects.map(r => r.origin.x))
        const minY = Math.min(...segmentRects.map(r => r.origin.y))
        const maxX = Math.max(...segmentRects.map(r => r.origin.x + r.size.width))
        const maxY = Math.max(...segmentRects.map(r => r.origin.y + r.size.height))
        boundingRect = {
          origin: { x: minX, y: minY },
          size: { width: maxX - minX, height: maxY - minY }
        }
      }

      // Generate unique ID for the annotation
      const annotationId = `ann_${nanoid(10)}`
      const now = new Date().toISOString()

      // Track this ID to avoid duplicate from event handler
      createdAnnotationIds.current.add(annotationId)

      // type: 10 is PdfAnnotationSubtype.UNDERLINE
      const embedAnnotation = {
        id: annotationId,
        type: 10, // UNDERLINE enum value
        pageIndex,
        rect: boundingRect,
        segmentRects,
        strokeColor: highlightColor,
        opacity: 1,
        contents: typeof text === 'string' ? text : ''
      }

      annotationScope.createAnnotation?.(pageIndex, embedAnnotation)

      // Also directly save to our store and storage
      const scholarAnnotation = {
        id: annotationId,
        type: 'underline',
        color: highlightColor,
        created_at: now,
        updated_at: now,
        position: {
          page: pageIndex,
          rects: segmentRects.map(r => ({
            x1: r.origin.x,
            y1: r.origin.y,
            x2: r.origin.x + r.size.width,
            y2: r.origin.y + r.size.height
          })),
          boundingRect: boundingRect ? {
            x1: boundingRect.origin.x,
            y1: boundingRect.origin.y,
            x2: boundingRect.origin.x + boundingRect.size.width,
            y2: boundingRect.origin.y + boundingRect.size.height
          } : null
        },
        content: { text: typeof text === 'string' ? text : '', image: null },
        comment: '',
        tags: [],
        ai_context: { include_in_embeddings: true },
        source: 'user'
      }

      storeAddAnnotation(scholarAnnotation)

      if (adapter && docId) {
        AnnotationService.addAnnotation(adapter, docId, scholarAnnotation, {
          onSaveStart: () => setSaveStatus('saving'),
          onSaveComplete: () => setSaveStatus('saved'),
          onSaveError: () => setSaveStatus('error')
        })
      }

      return true
    } catch (error) {
      console.error('Failed to create underline:', error)
      return null
    }
  }, [annotationScope, highlightColor, adapter, docId, storeAddAnnotation, setSaveStatus])

  /**
   * Create an area/rectangle annotation
   */
  const createAreaAnnotation = useCallback((pageIndex, rect, imageData = null) => {
    if (!annotationScope) return null

    annotationScope.createAnnotation?.(pageIndex, {
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
  }, [annotationScope, highlightColor])

  /**
   * Update annotation comment
   */
  const updateComment = useCallback((annotationId, comment) => {
    if (!adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Update in EmbedPDF if available
    if (annotationScope) {
      annotationScope.updateAnnotation?.(annotation.position?.page ?? 0, annotationId, {
        contents: comment
      })
    }

    // Directly update store and storage
    const patch = { comment }
    storeUpdateAnnotation(annotationId, patch)
    AnnotationService.updateAnnotation(adapter, docId, annotationId, patch, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [annotationScope, adapter, docId, getAnnotationById, storeUpdateAnnotation, setSaveStatus])

  /**
   * Update annotation color
   */
  const updateColor = useCallback((annotationId, color) => {
    if (!adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Update in EmbedPDF if available - use strokeColor for text markup
    if (annotationScope) {
      annotationScope.updateAnnotation?.(annotation.position?.page ?? 0, annotationId, {
        strokeColor: color
      })
    }

    // Directly update store and storage
    const patch = { color }
    storeUpdateAnnotation(annotationId, patch)
    AnnotationService.updateAnnotation(adapter, docId, annotationId, patch, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [annotationScope, adapter, docId, getAnnotationById, storeUpdateAnnotation, setSaveStatus])

  /**
   * Update annotation type (highlight <-> underline)
   * For EmbedPDF, this requires deleting and recreating the annotation
   */
  const updateType = useCallback((annotationId, newType) => {
    if (!adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Only allow changing between highlight and underline
    const allowedTypes = ['highlight', 'underline']
    if (!allowedTypes.includes(newType) || !allowedTypes.includes(annotation.type)) {
      return false
    }

    // Map type to EmbedPDF type number
    const typeMap = { highlight: 9, underline: 10 }
    const embedType = typeMap[newType]

    // Update in EmbedPDF by deleting and recreating
    if (annotationScope && annotation.position?.page !== undefined) {
      const pageIndex = annotation.position.page

      // Delete the old annotation
      annotationScope.deleteAnnotation?.(pageIndex, annotationId)

      // Track to prevent duplicate from event handler
      createdAnnotationIds.current.add(annotationId)

      // Recreate with new type
      const segmentRects = annotation.position.rects?.map(r => ({
        origin: { x: r.x1, y: r.y1 },
        size: { width: r.x2 - r.x1, height: r.y2 - r.y1 }
      })) || []

      const boundingRect = annotation.position.boundingRect ? {
        origin: { x: annotation.position.boundingRect.x1, y: annotation.position.boundingRect.y1 },
        size: {
          width: annotation.position.boundingRect.x2 - annotation.position.boundingRect.x1,
          height: annotation.position.boundingRect.y2 - annotation.position.boundingRect.y1
        }
      } : null

      const embedAnnotation = {
        id: annotationId,
        type: embedType,
        pageIndex,
        rect: boundingRect,
        segmentRects,
        strokeColor: annotation.color,
        opacity: newType === 'highlight' ? 0.35 : 1,
        contents: annotation.content?.text || ''
      }

      annotationScope.createAnnotation?.(pageIndex, embedAnnotation)
    }

    // Update store and storage
    const patch = { type: newType }
    storeUpdateAnnotation(annotationId, patch)
    AnnotationService.updateAnnotation(adapter, docId, annotationId, patch, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [annotationScope, adapter, docId, getAnnotationById, storeUpdateAnnotation, setSaveStatus])

  /**
   * Delete an annotation
   */
  const deleteAnnotation = useCallback((annotationId) => {
    if (!adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Delete in EmbedPDF if available
    if (annotationScope) {
      annotationScope.deleteAnnotation?.(annotation.position?.page ?? 0, annotationId)
    }

    // Directly update store and storage
    storeDeleteAnnotation(annotationId)
    AnnotationService.deleteAnnotation(adapter, docId, annotationId, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [annotationScope, adapter, docId, getAnnotationById, storeDeleteAnnotation, setSaveStatus])

  /**
   * Select an annotation
   */
  const selectAnnotation = useCallback((annotationId) => {
    if (!annotationScope) return

    const annotation = getAnnotationById(annotationId)
    if (annotation) {
      annotationScope.selectAnnotation?.(annotation.position?.page ?? 0, annotationId)
    }
    setSelectedAnnotation(annotationId)
  }, [annotationScope, getAnnotationById, setSelectedAnnotation])

  /**
   * Clear selection
   */
  const clearSelection = useCallback(() => {
    if (annotationScope && selectedAnnotationId) {
      const annotation = getAnnotationById(selectedAnnotationId)
      if (annotation) {
        annotationScope.deselectAnnotation?.(annotation.position?.page ?? 0, selectedAnnotationId)
      }
    }
    setSelectedAnnotation(null)
  }, [annotationScope, selectedAnnotationId, getAnnotationById, setSelectedAnnotation])

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
    updateType,

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
