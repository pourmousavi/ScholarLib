import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useTextSelection - Track text selection on PDF text layer
 *
 * Captures text selection with position data for creating highlights.
 * Works with PDF.js text layer.
 *
 * @param {Object} options - Configuration options
 * @param {React.RefObject} options.containerRef - Reference to the PDF viewer container
 * @param {number} options.currentPage - Current page number
 * @param {function} options.onSelectionChange - Callback when selection changes
 * @returns {Object} Selection state and methods
 */
export function useTextSelection({ containerRef, currentPage, onSelectionChange }) {
  const [selection, setSelection] = useState(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const selectionTimeoutRef = useRef(null)

  /**
   * Get page number from a DOM element within text layer
   */
  const getPageFromElement = useCallback((element) => {
    const pageContainer = element.closest('[data-page-number]')
    if (pageContainer) {
      return parseInt(pageContainer.dataset.pageNumber, 10)
    }
    return currentPage
  }, [currentPage])

  /**
   * Convert client rects to PDF coordinates
   * Normalizes coordinates relative to the page container
   */
  const getRectsRelativeToPage = useCallback((range, pageElement) => {
    if (!pageElement) return []

    const pageRect = pageElement.getBoundingClientRect()
    const clientRects = range.getClientRects()
    const rects = []

    for (const rect of clientRects) {
      // Skip empty rects
      if (rect.width === 0 || rect.height === 0) continue

      rects.push({
        x1: rect.left - pageRect.left,
        y1: rect.top - pageRect.top,
        x2: rect.right - pageRect.left,
        y2: rect.bottom - pageRect.top,
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
      if (Math.abs(yDiff) > 5) return yDiff // Different lines
      return a.x1 - b.x1 // Same line, sort by x
    })

    const merged = []
    let current = { ...sorted[0] }

    for (let i = 1; i < sorted.length; i++) {
      const rect = sorted[i]

      // Check if same line (within 5px tolerance)
      const sameLine = Math.abs(rect.y1 - current.y1) < 5

      // Check if adjacent (within 3px gap)
      const adjacent = sameLine && (rect.x1 - current.x2) < 3

      if (adjacent) {
        // Extend current rect
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
      setSelection(null)
      onSelectionChange?.(null)
      return
    }

    const range = windowSelection.getRangeAt(0)
    const text = windowSelection.toString().trim()

    if (!text) {
      setSelection(null)
      onSelectionChange?.(null)
      return
    }

    // Check if selection is within our container
    if (containerRef?.current && !containerRef.current.contains(range.commonAncestorContainer)) {
      return
    }

    // Get the page element
    const startContainer = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer
    const pageElement = startContainer?.closest('[data-page-number]')

    if (!pageElement) {
      // Selection not in a page, ignore
      return
    }

    const page = parseInt(pageElement.dataset.pageNumber, 10)
    const rawRects = getRectsRelativeToPage(range, pageElement)
    const rects = mergeAdjacentRects(rawRects)
    const boundingRect = getBoundingRect(rects)

    if (rects.length === 0) {
      setSelection(null)
      onSelectionChange?.(null)
      return
    }

    const selectionData = {
      text,
      page,
      rects,
      boundingRect,
      range: range.cloneRange() // Clone to preserve after selection changes
    }

    setSelection(selectionData)
    onSelectionChange?.(selectionData)
  }, [containerRef, getRectsRelativeToPage, mergeAdjacentRects, getBoundingRect, onSelectionChange])

  /**
   * Handle mouse up - process selection
   */
  const handleMouseUp = useCallback(() => {
    // Small delay to ensure selection is complete
    selectionTimeoutRef.current = setTimeout(() => {
      processSelection()
      setIsSelecting(false)
    }, 10)
  }, [processSelection])

  /**
   * Handle mouse down - start selection
   */
  const handleMouseDown = useCallback(() => {
    setIsSelecting(true)
    // Clear any pending timeout
    if (selectionTimeoutRef.current) {
      clearTimeout(selectionTimeoutRef.current)
    }
  }, [])

  /**
   * Handle selection change from document
   */
  const handleSelectionChange = useCallback(() => {
    if (isSelecting) {
      // During drag, update selection state but don't finalize
      return
    }

    const windowSelection = window.getSelection()
    if (!windowSelection || windowSelection.isCollapsed) {
      // Selection cleared (e.g., user clicked elsewhere)
      // Don't clear immediately to allow for toolbar interaction
      selectionTimeoutRef.current = setTimeout(() => {
        const currentSelection = window.getSelection()
        if (!currentSelection || currentSelection.isCollapsed) {
          setSelection(null)
          onSelectionChange?.(null)
        }
      }, 200)
    }
  }, [isSelecting, onSelectionChange])

  /**
   * Clear selection programmatically
   */
  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    onSelectionChange?.(null)
  }, [onSelectionChange])

  /**
   * Restore selection from saved range
   */
  const restoreSelection = useCallback((selectionData) => {
    if (!selectionData?.range) return

    try {
      const windowSelection = window.getSelection()
      windowSelection?.removeAllRanges()
      windowSelection?.addRange(selectionData.range)
    } catch (error) {
      console.warn('Could not restore selection:', error)
    }
  }, [])

  // Set up event listeners
  useEffect(() => {
    const container = containerRef?.current
    if (!container) return

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('selectionchange', handleSelectionChange)

      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current)
      }
    }
  }, [containerRef, handleMouseDown, handleMouseUp, handleSelectionChange])

  return {
    selection,
    isSelecting,
    clearSelection,
    restoreSelection,
    processSelection
  }
}
