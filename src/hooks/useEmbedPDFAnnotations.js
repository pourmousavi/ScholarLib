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
  // Track annotations being recreated for type change (skip delete events for these)
  const typeChangeIds = useRef(new Set())
  // Map ScholarLib ID → EmbedPDF ID when they differ (after type change re-creation)
  const embedIdMap = useRef(new Map())
  // Resolve the EmbedPDF-side ID for a ScholarLib annotation ID
  const getEmbedId = useCallback((scholarId) => embedIdMap.current.get(scholarId) || scholarId, [])

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

        // Ensure the store's currentAnnotations is in sync with the service cache.
        // setCurrentDoc may have run before the service cache was ready, leaving
        // currentAnnotations empty even though EmbedPDF now shows the highlights.
        if (currentAnnotations.length === 0 && existingAnnotations.length > 0) {
          setCurrentDoc(docId)
        }
      } catch (error) {
        console.error('Failed to import annotations:', error)
      }
    }

    setIsInitialized(true)
  }, [annotationScope, docId, isInitialized, isLoaded, currentAnnotations.length, setCurrentDoc])

  // Native PDF annotation auto-import is disabled — it was pulling in
  // hundreds of internal PDF objects (links, widgets, text markers) as
  // user-visible annotations.  Native annotations can still be imported
  // on-demand via the Import service when explicitly requested.

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
            // Skip store/storage delete if this is part of a type change (delete+recreate)
            if (typeChangeIds.current.has(event.annotationId)) {
              typeChangeIds.current.delete(event.annotationId)
              return
            }
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
   * Create a text note annotation at a specific position on the page
   * @param {number} pageIndex - The page index (0-based)
   * @param {number} x - X coordinate in PDF space
   * @param {number} y - Y coordinate in PDF space
   * @param {string} comment - The note text
   * @param {string} color - Hex color for the note
   * @returns {boolean} Success status
   */
  const createTextNote = useCallback((pageIndex, x, y, comment, color) => {
    if (!adapter || !docId) return null

    try {
      const annotationId = `ann_${nanoid(10)}`
      const now = new Date().toISOString()
      const noteColor = color || highlightColor

      // Note: We do NOT create an EmbedPDF annotation here because ScholarLib
      // renders its own note pin markers. Creating an EmbedPDF FREETEXT
      // annotation causes a visible underline/box artifact beneath the pin.

      const noteSize = 24

      // Save to ScholarLib store and storage
      const scholarAnnotation = {
        id: annotationId,
        type: 'note',
        color: noteColor,
        created_at: now,
        updated_at: now,
        position: {
          page: pageIndex,
          rects: [{
            x1: x, y1: y,
            x2: x + noteSize, y2: y + noteSize
          }],
          boundingRect: {
            x1: x, y1: y,
            x2: x + noteSize, y2: y + noteSize
          }
        },
        content: { text: comment, image: null },
        comment,
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

      return annotationId
    } catch (error) {
      console.error('Failed to create text note:', error)
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
   * Update annotation position (used for dragging note pins)
   * @param {string} annotationId - The annotation ID
   * @param {number} newX - New X coordinate in PDF space
   * @param {number} newY - New Y coordinate in PDF space
   * @returns {boolean} Success status
   */
  const updatePosition = useCallback((annotationId, newX, newY) => {
    if (!adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    const noteSize = 24
    const newPosition = {
      ...annotation.position,
      rects: [{
        x1: newX, y1: newY,
        x2: newX + noteSize, y2: newY + noteSize
      }],
      boundingRect: {
        x1: newX, y1: newY,
        x2: newX + noteSize, y2: newY + noteSize
      }
    }

    // Update in EmbedPDF if available
    if (annotationScope) {
      const embedId = getEmbedId(annotationId)
      annotationScope.updateAnnotation?.(annotation.position?.page ?? 0, embedId, {
        rect: {
          origin: { x: newX, y: newY },
          size: { width: noteSize, height: noteSize }
        }
      })
    }

    const patch = { position: newPosition }
    storeUpdateAnnotation(annotationId, patch)
    AnnotationService.updateAnnotation(adapter, docId, annotationId, patch, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [annotationScope, adapter, docId, getAnnotationById, getEmbedId, storeUpdateAnnotation, setSaveStatus])

  /**
   * Update annotation comment
   */
  const updateComment = useCallback((annotationId, comment) => {
    if (!adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Update in EmbedPDF if available
    if (annotationScope) {
      const embedId = getEmbedId(annotationId)
      annotationScope.updateAnnotation?.(annotation.position?.page ?? 0, embedId, {
        contents: comment
      })
    }

    // For note-type annotations, keep content.text in sync with comment
    const patch = annotation.type === 'note'
      ? { comment, content: { ...annotation.content, text: comment } }
      : { comment }

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
      const embedId = getEmbedId(annotationId)
      annotationScope.updateAnnotation?.(annotation.position?.page ?? 0, embedId, {
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
   * Deletes the old EmbedPDF annotation and imports a replacement with a
   * fresh ID to avoid EmbedPDF history/state conflicts.  The mapping
   * between ScholarLib ID and EmbedPDF ID is tracked in embedIdMap.
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

    if (annotationScope && annotation.position?.page !== undefined) {
      const pageIndex = annotation.position.page
      const oldEmbedId = getEmbedId(annotationId)

      // Delete old visual — skip store delete via typeChangeIds
      typeChangeIds.current.add(oldEmbedId)
      annotationScope.deleteAnnotation?.(pageIndex, oldEmbedId)

      // Build replacement with a brand-new EmbedPDF ID
      const newEmbedId = `ann_${nanoid(10)}`
      embedIdMap.current.set(annotationId, newEmbedId)

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

      // Import with the new ID — bypasses history, no ID collision
      createdAnnotationIds.current.add(newEmbedId)
      annotationScope.importAnnotations?.([{
        annotation: {
          id: newEmbedId,
          type: embedType,
          pageIndex,
          rect: boundingRect,
          segmentRects,
          strokeColor: annotation.color,
          opacity: newType === 'highlight' ? 0.35 : 1,
          contents: annotation.content?.text || ''
        }
      }])
    }

    // Update store and storage (keeps original ScholarLib ID)
    const patch = { type: newType }
    storeUpdateAnnotation(annotationId, patch)
    AnnotationService.updateAnnotation(adapter, docId, annotationId, patch, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [annotationScope, adapter, docId, getAnnotationById, getEmbedId, storeUpdateAnnotation, setSaveStatus])

  /**
   * Delete an annotation
   */
  const deleteAnnotation = useCallback((annotationId) => {
    if (!adapter || !docId) return false

    const annotation = getAnnotationById(annotationId)
    if (!annotation) return false

    // Delete in EmbedPDF using the mapped ID
    if (annotationScope) {
      const embedId = getEmbedId(annotationId)
      annotationScope.deleteAnnotation?.(annotation.position?.page ?? 0, embedId)
      embedIdMap.current.delete(annotationId)
    }

    storeDeleteAnnotation(annotationId)
    AnnotationService.deleteAnnotation(adapter, docId, annotationId, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => setSaveStatus('saved'),
      onSaveError: () => setSaveStatus('error')
    })

    return true
  }, [annotationScope, adapter, docId, getAnnotationById, getEmbedId, storeDeleteAnnotation, setSaveStatus])

  /**
   * Select an annotation
   */
  const selectAnnotation = useCallback((annotationId) => {
    if (!annotationScope) return

    const annotation = getAnnotationById(annotationId)
    if (annotation) {
      const embedId = getEmbedId(annotationId)
      annotationScope.selectAnnotation?.(annotation.position?.page ?? 0, embedId)
    }
    setSelectedAnnotation(annotationId)
  }, [annotationScope, getAnnotationById, getEmbedId, setSelectedAnnotation])

  /**
   * Clear selection
   */
  const clearSelection = useCallback(() => {
    if (annotationScope && selectedAnnotationId) {
      const annotation = getAnnotationById(selectedAnnotationId)
      if (annotation) {
        const embedId = getEmbedId(selectedAnnotationId)
        annotationScope.deselectAnnotation?.(annotation.position?.page ?? 0, embedId)
      }
    }
    setSelectedAnnotation(null)
  }, [annotationScope, selectedAnnotationId, getAnnotationById, getEmbedId, setSelectedAnnotation])

  /**
   * Delete all annotations for the current document
   */
  const deleteAllAnnotations = useCallback(() => {
    if (!adapter || !docId) return false

    if (annotationScope) {
      for (const ann of currentAnnotations) {
        const embedId = getEmbedId(ann.id)
        annotationScope.deleteAnnotation?.(ann.position?.page ?? 0, embedId)
      }
    }
    embedIdMap.current.clear()

    for (const ann of currentAnnotations) {
      storeDeleteAnnotation(ann.id)
    }

    AnnotationService.clearDocAnnotations(docId)
    AnnotationService.flushSave(adapter).catch(console.error)

    setSaveStatus('saved')
    return true
  }, [annotationScope, adapter, docId, currentAnnotations, getEmbedId, storeDeleteAnnotation, setSaveStatus])

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
    createTextNote,
    createAreaAnnotation,

    // Update methods
    updateComment,
    updateColor,
    updateType,
    updatePosition,

    // Delete methods
    deleteAnnotation,
    deleteAllAnnotations,

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
