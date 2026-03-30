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

    console.log('[EmbedPDF Annotations] Loading annotations from storage...')

    const loadAnnotations = async () => {
      try {
        const annotations = await AnnotationService.loadAnnotations(adapter)
        console.log('[EmbedPDF Annotations] Loaded annotations:', annotations)
        setAnnotationsCache(annotations)
      } catch (error) {
        console.error('[EmbedPDF Annotations] Failed to load annotations:', error)
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
    console.log('[EmbedPDF Annotations] Import effect check:', {
      hasScope: !!annotationScope,
      docId,
      isInitialized,
      isLoaded
    })

    if (!annotationScope || !docId || isInitialized || !isLoaded) return

    console.log('[EmbedPDF Annotations] Importing annotations for doc:', docId)

    const existingAnnotations = AnnotationService.getAnnotationsForDoc(docId)
    console.log('[EmbedPDF Annotations] Found existing annotations:', existingAnnotations.length)

    if (existingAnnotations.length > 0) {
      try {
        // Convert to EmbedPDF format and import
        const embedAnnotations = toEmbedPDFArray(existingAnnotations)
        console.log('[EmbedPDF Annotations] Converted to EmbedPDF format:', embedAnnotations)
        annotationScope.importAnnotations?.(embedAnnotations)
        console.log(`[EmbedPDF Annotations] Imported ${embedAnnotations.length} annotations into EmbedPDF`)
      } catch (error) {
        console.error('[EmbedPDF Annotations] Failed to import annotations:', error)
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
      console.log('[EmbedPDF Annotations] Event received:', {
        type: event.type,
        committed: event.committed,
        annotationId: event.annotationId,
        hasAnnotation: !!event.annotation
      })

      // Skip non-committed create/update events (interim changes during editing)
      // But always process committed events for persistence
      if ((event.type === 'create' || event.type === 'update') && !event.committed) {
        console.log('[EmbedPDF Annotations] Skipping non-committed event')
        return
      }

      const converted = fromEmbedPDFEvent(event)
      console.log('[EmbedPDF Annotations] Converted event:', converted)

      switch (event.type) {
        case 'create':
          if (converted.annotation) {
            console.log('[EmbedPDF Annotations] Adding annotation to store:', converted.annotation.id)
            // Add to store
            storeAddAnnotation(converted.annotation)

            // Persist to storage
            AnnotationService.addAnnotation(adapter, docId, converted.annotation, {
              onSaveStart: () => setSaveStatus('saving'),
              onSaveComplete: () => {
                console.log('[EmbedPDF Annotations] Annotation saved successfully')
                setSaveStatus('saved')
              },
              onSaveError: (err) => {
                console.error('[EmbedPDF Annotations] Failed to save annotation:', err)
                setSaveStatus('error')
              }
            })
          }
          break

        case 'update':
          if (event.annotationId && converted.patch) {
            console.log('[EmbedPDF Annotations] Updating annotation:', event.annotationId)
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
            console.log('[EmbedPDF Annotations] Deleting annotation:', event.annotationId)
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
          console.log('[EmbedPDF Annotations] Unknown event type:', event.type)
          break
      }
    }

    // Subscribe to events using the capability (which has onAnnotationEvent)
    console.log('[EmbedPDF Annotations] Subscribing to annotation events')
    eventUnsubscribeRef.current = annotationCapability.onAnnotationEvent?.(handleAnnotationEvent)

    return () => {
      if (eventUnsubscribeRef.current) {
        console.log('[EmbedPDF Annotations] Unsubscribing from annotation events')
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
    console.log('[EmbedPDF Annotations] createHighlight called:', { pageIndex, selectionData, text })

    if (!annotationScope) {
      console.error('[EmbedPDF Annotations] No annotationScope available')
      return null
    }

    try {
      // Extract segmentRects from selection data
      // selectionData is an array with objects containing { pageIndex, rect, segmentRects }
      const rawRects = selectionData.flatMap(item => item.segmentRects || [])
      console.log('[EmbedPDF Annotations] Raw segmentRects:', JSON.stringify(rawRects, null, 2))

      if (rawRects.length === 0) {
        console.warn('[EmbedPDF Annotations] No segmentRects found in selection data')
        return null
      }

      // Ensure rects are in correct format: { origin: { x, y }, size: { width, height } }
      // Selection plugin should already provide them in this format, but validate
      const segmentRects = rawRects.map(rect => {
        // If already in correct format, return as-is
        if (rect.origin && rect.size) {
          return rect
        }
        // If in { x, y, width, height } format, convert
        if ('x' in rect && 'y' in rect && 'width' in rect && 'height' in rect) {
          return {
            origin: { x: rect.x, y: rect.y },
            size: { width: rect.width, height: rect.height }
          }
        }
        // If in { x1, y1, x2, y2 } format, convert
        if ('x1' in rect && 'y1' in rect && 'x2' in rect && 'y2' in rect) {
          return {
            origin: { x: rect.x1, y: rect.y1 },
            size: { width: rect.x2 - rect.x1, height: rect.y2 - rect.y1 }
          }
        }
        console.warn('[EmbedPDF Annotations] Unknown rect format:', rect)
        return rect
      })

      console.log('[EmbedPDF Annotations] Converted segmentRects:', JSON.stringify(segmentRects, null, 2))

      // Get the bounding rect from selection data - EmbedPDF requires this
      // Use the first selection item's rect, or compute from segmentRects
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

      console.log('[EmbedPDF Annotations] Bounding rect:', JSON.stringify(boundingRect, null, 2))

      // Generate unique ID for the annotation
      const annotationId = `ann_${nanoid(10)}`
      const now = new Date().toISOString()

      // Create highlight annotation with correct EmbedPDF format
      // type: 9 is PdfAnnotationSubtype.HIGHLIGHT
      // EmbedPDF requires both rect (bounding box) and segmentRects (individual line rects)
      const embedAnnotation = {
        id: annotationId,
        type: 9, // HIGHLIGHT enum value
        pageIndex,
        rect: boundingRect,
        segmentRects,
        strokeColor: highlightColor,
        opacity: 0.35,
        contents: typeof text === 'string' ? text : ''
      }

      console.log('[EmbedPDF Annotations] Creating annotation:', JSON.stringify(embedAnnotation, null, 2))

      // Create annotation in EmbedPDF for visual rendering
      annotationScope.createAnnotation?.(pageIndex, embedAnnotation)
      console.log('[EmbedPDF Annotations] createAnnotation called on EmbedPDF')

      // Also directly save to our store and storage (don't rely on events)
      const scholarAnnotation = {
        id: annotationId,
        type: 'highlight',
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

      console.log('[EmbedPDF Annotations] Adding to store:', scholarAnnotation.id)
      storeAddAnnotation(scholarAnnotation)

      // Persist to storage
      console.log('[EmbedPDF Annotations] Checking storage availability:', { hasAdapter: !!adapter, docId })
      if (adapter && docId) {
        console.log('[EmbedPDF Annotations] Saving annotation to storage...')
        AnnotationService.addAnnotation(adapter, docId, scholarAnnotation, {
          onSaveStart: () => {
            console.log('[EmbedPDF Annotations] Save started')
            setSaveStatus('saving')
          },
          onSaveComplete: () => {
            console.log('[EmbedPDF Annotations] Annotation saved to storage successfully')
            setSaveStatus('saved')
          },
          onSaveError: (err) => {
            console.error('[EmbedPDF Annotations] Failed to save annotation:', err)
            setSaveStatus('error')
          }
        })
      } else {
        console.warn('[EmbedPDF Annotations] Cannot save - missing adapter or docId')
      }

      return true
    } catch (error) {
      console.error('[EmbedPDF Annotations] createAnnotation failed:', error)
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
      console.error('[EmbedPDF Annotations] createUnderline failed:', error)
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
    if (!annotationScope || !adapter || !docId) return false

    // Find the annotation to get its page
    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Update in EmbedPDF
    annotationScope.updateAnnotation?.(annotation.position?.page ?? 0, annotationId, {
      contents: comment
    })

    // Update in store and storage (will be triggered by event handler)
    return true
  }, [annotationScope, adapter, docId, getAnnotationById])

  /**
   * Update annotation color
   */
  const updateColor = useCallback((annotationId, color) => {
    if (!annotationScope || !adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Update in EmbedPDF
    annotationScope.updateAnnotation?.(annotation.position?.page ?? 0, annotationId, {
      color: { ...hexToRgbaInternal(color), a: 0.35 }
    })

    return true
  }, [annotationScope, adapter, docId, getAnnotationById])

  /**
   * Delete an annotation
   */
  const deleteAnnotation = useCallback((annotationId) => {
    if (!annotationScope || !adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Delete in EmbedPDF
    annotationScope.deleteAnnotation?.(annotation.position?.page ?? 0, annotationId)

    return true
  }, [annotationScope, adapter, docId, getAnnotationById])

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
