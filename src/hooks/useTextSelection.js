import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useTextSelection - Track text selection on PDF text layer
 *
 * Captures text selection with position data for creating highlights.
 * Works with PDF.js text layer.
 *
 * @param {Object} options - Configuration options
 * @param {React.RefObject} options.containerRef - Reference to the page wrapper
 * @param {number} options.currentPage - Current page number
 * @param {function} options.onSelectionChange - Callback when selection changes
 * @returns {Object} Selection state and methods
 */
export function useTextSelection({ containerRef, currentPage, onSelectionChange, disabled = false }) {
  const [selection, setSelection] = useState(null)
  const isMouseDownRef = useRef(false)
  const lastProcessedRef = useRef(null)

  /**
   * Convert client rects to page-relative coordinates
   * Uses the text layer element as reference since that's where selections happen
   */
  const getRectsRelativeToPage = useCallback((range, pageElement) => {
    if (!pageElement) return []

    // Use text layer as reference point since that's where the selection spans are
    // This ensures coordinates align exactly with where the text visually appears
    const textLayer = pageElement.querySelector('[data-text-layer]')
    const refElement = textLayer || pageElement
    const refRect = refElement.getBoundingClientRect()

    const clientRects = range.getClientRects()
    const rects = []

    for (const rect of clientRects) {
      // Skip empty rects
      if (rect.width === 0 || rect.height === 0) continue

      rects.push({
        x1: rect.left - refRect.left,
        y1: rect.top - refRect.top,
        x2: rect.right - refRect.left,
        y2: rect.bottom - refRect.top,
        width: rect.width,
        height: rect.height
      })
    }

    return rects
  }, [])

  /**
   * Merge adjacent rects on same line
   */
  const mergeAdjacentRects = useCallback((rects) => {
    if (rects.length <= 1) return rects

    // Sort by y position, then x
    const sorted = [...rects].sort((a, b) => {
      const yDiff = a.y1 - b.y1
      if (Math.abs(yDiff) > 5) return yDiff
      return a.x1 - b.x1
    })

    const merged = []
    let current = { ...sorted[0] }

    for (let i = 1; i < sorted.length; i++) {
      const rect = sorted[i]
      const sameLine = Math.abs(rect.y1 - current.y1) < 5
      const adjacent = sameLine && (rect.x1 - current.x2) < 3

      if (adjacent) {
        current.x2 = Math.max(current.x2, rect.x2)
        current.y2 = Math.max(current.y2, rect.y2)
        current.width = current.x2 - current.x1
        current.height = current.y2 - current.y1
      } else {
        merged.push(current)
        current = { ...rect }
      }
    }

    merged.push(current)
    return merged
  }, [])

  /**
   * Calculate bounding rect from multiple rects
   */
  const getBoundingRect = useCallback((rects) => {
    if (rects.length === 0) return null

    return rects.reduce((bounds, rect) => ({
      x1: Math.min(bounds.x1, rect.x1),
      y1: Math.min(bounds.y1, rect.y1),
      x2: Math.max(bounds.x2, rect.x2),
      y2: Math.max(bounds.y2, rect.y2)
    }), {
      x1: Infinity,
      y1: Infinity,
      x2: -Infinity,
      y2: -Infinity
    })
  }, [])

  /**
   * Process current text selection
   */
  const processSelection = useCallback(() => {
    const windowSelection = window.getSelection()

    if (!windowSelection || windowSelection.isCollapsed || !windowSelection.rangeCount) {
      return null
    }

    const range = windowSelection.getRangeAt(0)
    const text = windowSelection.toString().trim()

    if (!text) {
      return null
    }

    // Get the page element containing the selection
    const startContainer = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer
    const pageElement = startContainer?.closest('[data-page-number]')

    if (!pageElement) {
      return null
    }

    // Check if this selection belongs to our page
    const selectionPage = parseInt(pageElement.dataset.pageNumber, 10)
    if (selectionPage !== currentPage) {
      return null
    }

    const rawRects = getRectsRelativeToPage(range, pageElement)
    const rects = mergeAdjacentRects(rawRects)
    const boundingRect = getBoundingRect(rects)

    if (rects.length === 0) {
      return null
    }

    return {
      text,
      page: selectionPage,
      rects,
      boundingRect
    }
  }, [currentPage, getRectsRelativeToPage, mergeAdjacentRects, getBoundingRect])

  /**
   * Handle mouse up - check for selection
   */
  const handleMouseUp = useCallback(() => {
    isMouseDownRef.current = false

    // Small delay to ensure selection is finalized
    requestAnimationFrame(() => {
      const selectionData = processSelection()

      if (selectionData) {
        // Avoid duplicate processing
        const selectionKey = `${selectionData.page}:${selectionData.text}`
        if (lastProcessedRef.current === selectionKey) {
          return
        }
        lastProcessedRef.current = selectionKey

        setSelection(selectionData)
        onSelectionChange?.(selectionData)
      }
    })
  }, [processSelection, onSelectionChange])

  /**
   * Handle mouse down - track selection start
   */
  const handleMouseDown = useCallback((e) => {
    isMouseDownRef.current = true
    lastProcessedRef.current = null

    // If clicking inside text layer, allow new selection
    const textLayer = e.target.closest('.textLayer')
    if (textLayer) {
      // Selection is starting, will be processed on mouseup
      setSelection(null)
    }
  }, [])

  /**
   * Clear selection programmatically
   */
  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    lastProcessedRef.current = null
    onSelectionChange?.(null)
  }, [onSelectionChange])

  // Set up event listeners on the container (skip on mobile phones)
  useEffect(() => {
    const container = containerRef?.current
    if (!container || disabled) return

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mouseup', handleMouseUp)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('mouseup', handleMouseUp)
    }
  }, [containerRef, handleMouseDown, handleMouseUp, disabled])

  return {
    selection,
    clearSelection,
    processSelection
  }
}
