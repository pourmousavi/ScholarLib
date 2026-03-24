import { memo, useCallback, useEffect, useRef, useState } from 'react'
import styles from './AreaSelector.module.css'

/**
 * AreaSelector - Component for selecting rectangular regions on PDF
 *
 * Allows users to drag to select a rectangular area on a PDF page
 * for creating area annotations.
 *
 * @param {boolean} active - Whether area selection mode is active
 * @param {function} onAreaSelected - Callback when area is selected
 * @param {function} onCancel - Callback to cancel selection
 * @param {React.RefObject} containerRef - Reference to PDF container
 */
function AreaSelector({ active, onAreaSelected, onCancel, containerRef }) {
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState(null)
  const [currentRect, setCurrentRect] = useState(null)
  const [currentPage, setCurrentPage] = useState(null)
  const overlayRef = useRef(null)

  // Get page element from point
  const getPageFromPoint = useCallback((x, y) => {
    if (!containerRef?.current) return null

    const pages = containerRef.current.querySelectorAll('[data-page-number]')
    for (const page of pages) {
      const rect = page.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return {
          element: page,
          number: parseInt(page.dataset.pageNumber, 10),
          rect
        }
      }
    }
    return null
  }, [containerRef])

  // Convert screen coordinates to page coordinates
  const screenToPage = useCallback((screenX, screenY, pageRect) => {
    return {
      x: screenX - pageRect.left,
      y: screenY - pageRect.top
    }
  }, [])

  // Handle mouse down - start drawing
  const handleMouseDown = useCallback((e) => {
    if (!active) return

    const pageInfo = getPageFromPoint(e.clientX, e.clientY)
    if (!pageInfo) return

    e.preventDefault()
    const pagePoint = screenToPage(e.clientX, e.clientY, pageInfo.rect)

    setIsDrawing(true)
    setStartPoint({ x: e.clientX, y: e.clientY, pageX: pagePoint.x, pageY: pagePoint.y })
    setCurrentPage(pageInfo)
    setCurrentRect(null)
  }, [active, getPageFromPoint, screenToPage])

  // Handle mouse move - update rectangle
  const handleMouseMove = useCallback((e) => {
    if (!isDrawing || !startPoint || !currentPage) return

    const pagePoint = screenToPage(e.clientX, e.clientY, currentPage.rect)

    // Calculate rectangle bounds
    const x1 = Math.min(startPoint.pageX, pagePoint.x)
    const y1 = Math.min(startPoint.pageY, pagePoint.y)
    const x2 = Math.max(startPoint.pageX, pagePoint.x)
    const y2 = Math.max(startPoint.pageY, pagePoint.y)

    // Clamp to page bounds
    const width = currentPage.rect.width
    const height = currentPage.rect.height

    setCurrentRect({
      x1: Math.max(0, x1),
      y1: Math.max(0, y1),
      x2: Math.min(width, x2),
      y2: Math.min(height, y2),
      screenX: currentPage.rect.left + Math.max(0, x1),
      screenY: currentPage.rect.top + Math.max(0, y1),
      screenWidth: Math.min(width, x2) - Math.max(0, x1),
      screenHeight: Math.min(height, y2) - Math.max(0, y1)
    })
  }, [isDrawing, startPoint, currentPage, screenToPage])

  // Handle mouse up - finish drawing
  const handleMouseUp = useCallback(async (e) => {
    if (!isDrawing || !currentRect || !currentPage) {
      setIsDrawing(false)
      setStartPoint(null)
      setCurrentRect(null)
      setCurrentPage(null)
      return
    }

    // Minimum size threshold (10px)
    const minSize = 10
    if (currentRect.x2 - currentRect.x1 < minSize || currentRect.y2 - currentRect.y1 < minSize) {
      setIsDrawing(false)
      setStartPoint(null)
      setCurrentRect(null)
      setCurrentPage(null)
      return
    }

    // Capture area as image
    let imageData = null
    try {
      imageData = await captureAreaImage(currentPage.element, currentRect)
    } catch (err) {
      console.error('Failed to capture area:', err)
    }

    // Create position object
    const position = {
      page: currentPage.number,
      rects: [{
        x1: currentRect.x1,
        y1: currentRect.y1,
        x2: currentRect.x2,
        y2: currentRect.y2
      }],
      boundingRect: {
        x1: currentRect.x1,
        y1: currentRect.y1,
        x2: currentRect.x2,
        y2: currentRect.y2
      }
    }

    onAreaSelected?.(position, imageData)

    // Reset state
    setIsDrawing(false)
    setStartPoint(null)
    setCurrentRect(null)
    setCurrentPage(null)
  }, [isDrawing, currentRect, currentPage, onAreaSelected])

  // Handle escape to cancel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && active) {
        setIsDrawing(false)
        setStartPoint(null)
        setCurrentRect(null)
        setCurrentPage(null)
        onCancel?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active, onCancel])

  // Add event listeners when active
  useEffect(() => {
    if (!active) return

    const container = containerRef?.current
    if (!container) return

    container.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [active, containerRef, handleMouseDown, handleMouseMove, handleMouseUp])

  if (!active) return null

  return (
    <>
      {/* Selection overlay */}
      <div
        ref={overlayRef}
        className={styles.overlay}
        style={{ cursor: isDrawing ? 'crosshair' : 'crosshair' }}
      >
        {/* Drawing rectangle preview */}
        {isDrawing && currentRect && currentPage && (
          <div
            className={styles.selectionRect}
            style={{
              left: `${currentRect.screenX}px`,
              top: `${currentRect.screenY}px`,
              width: `${currentRect.screenWidth}px`,
              height: `${currentRect.screenHeight}px`
            }}
          />
        )}
      </div>

      {/* Instructions */}
      <div className={styles.instructions}>
        Drag to select area • Press Escape to cancel
      </div>
    </>
  )
}

/**
 * Capture a region of a PDF page as an image
 * @param {HTMLElement} pageElement - The page element containing the canvas
 * @param {Object} rect - The rectangle to capture { x1, y1, x2, y2 }
 * @returns {Promise<string>} Base64 encoded image data
 */
async function captureAreaImage(pageElement, rect) {
  const canvas = pageElement.querySelector('canvas')
  if (!canvas) return null

  // Get the canvas pixel ratio (PDF.js uses 1.5x for higher resolution)
  const canvasWidth = canvas.width
  const displayWidth = parseFloat(canvas.style.width)
  const scale = canvasWidth / displayWidth

  // Create a new canvas for the cropped region
  const cropCanvas = document.createElement('canvas')
  const ctx = cropCanvas.getContext('2d')

  const cropWidth = (rect.x2 - rect.x1) * scale
  const cropHeight = (rect.y2 - rect.y1) * scale

  cropCanvas.width = cropWidth
  cropCanvas.height = cropHeight

  // Draw the cropped region
  ctx.drawImage(
    canvas,
    rect.x1 * scale,
    rect.y1 * scale,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  )

  // Convert to base64
  return cropCanvas.toDataURL('image/png')
}

export default memo(AreaSelector)
