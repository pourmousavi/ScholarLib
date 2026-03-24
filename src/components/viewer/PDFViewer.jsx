import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { usePDFLoader } from '../../hooks/usePDFLoader'
import { useAnnotations, useTextSelection } from '../../hooks'
import { useUIStore } from '../../store/uiStore'
import { useAnnotationStore } from '../../store/annotationStore'
import { Spinner, Btn } from '../ui'
import { AnnotationLayer, HighlightToolbar, AnnotationPopover, AnnotationSidebar } from '../annotations'
import PDFToolbar from './PDFToolbar'
import FullscreenOverlay from '../layout/FullscreenOverlay'
import styles from './PDFViewer.module.css'

export default function PDFViewer({ url, docId, onTextExtracted }) {
  const pdfDefaultZoom = useUIStore((s) => s.pdfDefaultZoom)
  const splitViewEnabled = useUIStore((s) => s.splitViewEnabled)
  const setFullscreenOverlayVisible = useUIStore((s) => s.setFullscreenOverlayVisible)

  const {
    pdf,
    loading,
    error,
    currentPage,
    totalPages,
    zoom,
    extractedText,
    goToPage,
    nextPage,
    prevPage,
    zoomIn,
    zoomOut,
    retry
  } = usePDFLoader(url, pdfDefaultZoom)

  // Annotation state and methods
  const {
    annotations,
    selectedAnnotationId,
    highlightColor,
    showAnnotationSidebar,
    createHighlight,
    updateComment,
    updateColor,
    deleteAnnotation,
    selectAnnotation,
    clearSelection,
    setColor,
    toggleSidebar,
    setSidebar,
    getAnnotationsForPage,
    annotationCount
  } = useAnnotations(docId)

  const containerRef = useRef(null)
  const pageRefs = useRef({})
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [renderedPages, setRenderedPages] = useState([])
  const [visiblePage, setVisiblePage] = useState(1)

  // Text selection state
  const [textSelection, setTextSelection] = useState(null)

  // Popover state
  const [popoverAnnotation, setPopoverAnnotation] = useState(null)
  const [popoverPosition, setPopoverPosition] = useState(null)

  // Handle text selection from pages
  const handleTextSelection = useCallback((selection) => {
    setTextSelection(selection)
    // Clear annotation popover when selecting text
    if (selection) {
      setPopoverAnnotation(null)
      clearSelection()
    }
  }, [clearSelection])

  // Create highlight from selection
  const handleCreateHighlight = useCallback((options = {}) => {
    if (!textSelection) return

    const annotation = createHighlight(textSelection, {
      color: highlightColor,
      comment: options.withComment ? '' : undefined
    })

    // Clear selection
    setTextSelection(null)
    window.getSelection()?.removeAllRanges()

    // Open popover if creating with comment
    if (options.withComment && annotation) {
      setPopoverAnnotation(annotation)
      setPopoverPosition({
        top: textSelection.boundingRect.y2 + 8,
        left: textSelection.boundingRect.x1
      })
    }
  }, [textSelection, createHighlight, highlightColor])

  // Handle annotation click
  const handleAnnotationClick = useCallback((annotation) => {
    selectAnnotation(annotation.id)
    setTextSelection(null)

    // Find page element for positioning
    const pageElement = containerRef.current?.querySelector(
      `[data-page-number="${annotation.position?.page}"]`
    )
    if (pageElement) {
      const pageRect = pageElement.getBoundingClientRect()
      const containerRect = containerRef.current.getBoundingClientRect()
      const boundingRect = annotation.position?.boundingRect

      if (boundingRect) {
        setPopoverPosition({
          top: pageRect.top - containerRect.top + boundingRect.y2 + 8,
          left: pageRect.left - containerRect.left + boundingRect.x1
        })
        setPopoverAnnotation(annotation)
      }
    }
  }, [selectAnnotation])

  // Close popover
  const handleClosePopover = useCallback(() => {
    setPopoverAnnotation(null)
    setPopoverPosition(null)
    clearSelection()
  }, [clearSelection])

  // Navigate to annotation (from sidebar)
  const handleNavigateToAnnotation = useCallback((annotation) => {
    const pageNum = annotation.position?.page
    if (pageNum) {
      const pageRef = pageRefs.current[pageNum]
      if (pageRef) {
        pageRef.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [])

  // Notify parent of extracted text
  useEffect(() => {
    if (extractedText && onTextExtracted) {
      onTextExtracted(extractedText)
    }
  }, [extractedText, onTextExtracted])

  // Render all pages
  useEffect(() => {
    if (!pdf) {
      setRenderedPages([])
      return
    }

    const pages = []
    for (let i = 1; i <= pdf.numPages; i++) {
      pages.push(i)
    }
    setRenderedPages(pages)
  }, [pdf])

  // Track visible page on scroll
  useEffect(() => {
    if (!containerRef.current || renderedPages.length === 0) return

    const container = containerRef.current

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect()
      const containerCenter = containerRect.top + containerRect.height / 2

      let closestPage = 1
      let closestDistance = Infinity

      for (const [pageNum, ref] of Object.entries(pageRefs.current)) {
        if (!ref) continue
        const rect = ref.getBoundingClientRect()
        const pageCenter = rect.top + rect.height / 2
        const distance = Math.abs(pageCenter - containerCenter)

        if (distance < closestDistance) {
          closestDistance = distance
          closestPage = parseInt(pageNum, 10)
        }
      }

      setVisiblePage(closestPage)
    }

    container.addEventListener('scroll', handleScroll)
    // Initial check
    setTimeout(handleScroll, 100)

    return () => container.removeEventListener('scroll', handleScroll)
  }, [renderedPages])

  // Save scroll position
  useEffect(() => {
    if (!docId || !containerRef.current) return

    const savedPosition = sessionStorage.getItem(`pdf-scroll-${docId}`)
    if (savedPosition) {
      containerRef.current.scrollTop = parseInt(savedPosition, 10)
    }

    const handleScroll = () => {
      if (containerRef.current) {
        sessionStorage.setItem(`pdf-scroll-${docId}`, containerRef.current.scrollTop.toString())
      }
    }

    const container = containerRef.current
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [docId, pdf])

  // Scroll to page when navigation buttons are clicked
  const scrollToPage = useCallback((pageNum) => {
    const pageRef = pageRefs.current[pageNum]
    if (pageRef) {
      pageRef.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handlePrevPage = useCallback(() => {
    const newPage = Math.max(1, visiblePage - 1)
    scrollToPage(newPage)
  }, [visiblePage, scrollToPage])

  const handleNextPage = useCallback(() => {
    const newPage = Math.min(totalPages, visiblePage + 1)
    scrollToPage(newPage)
  }, [visiblePage, totalPages, scrollToPage])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.parentElement?.requestFullscreen()
      setIsFullscreen(true)
      // Show overlay automatically if split view is enabled
      if (splitViewEnabled) {
        setFullscreenOverlayVisible(true)
      }
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
      // Hide overlay when exiting fullscreen
      setFullscreenOverlayVisible(false)
    }
  }, [splitViewEnabled, setFullscreenOverlayVisible])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement
      setIsFullscreen(isNowFullscreen)
      // Hide overlay when exiting fullscreen
      if (!isNowFullscreen) {
        setFullscreenOverlayVisible(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [setFullscreenOverlayVisible])

  const setPageRef = useCallback((pageNum, ref) => {
    pageRefs.current[pageNum] = ref
  }, [])

  if (!url) {
    return (
      <div className={styles.viewer}>
        <div className={styles.placeholder}>
          <div className={styles.placeholderIcon}>PDF</div>
          <span className={styles.placeholderTitle}>No document selected</span>
          <span className={styles.placeholderText}>
            Select a paper from the list to view it here
          </span>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.viewer}>
        <div className={styles.loading}>
          <Spinner size={32} />
          <span className={styles.loadingText}>Loading PDF...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.viewer}>
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠</span>
          <span className={styles.errorText}>{error}</span>
          <Btn onClick={retry}>Retry</Btn>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.viewer}>
      <PDFToolbar
        currentPage={visiblePage}
        totalPages={totalPages}
        zoom={zoom}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        annotationCount={annotationCount}
        onToggleAnnotations={toggleSidebar}
        showAnnotationSidebar={showAnnotationSidebar}
      />
      <div className={styles.viewerContent}>
        <div className={styles.container} ref={containerRef}>
          <div className={styles.pages}>
            {renderedPages.map((pageNum) => (
              <PageCanvas
                key={pageNum}
                pdf={pdf}
                pageNumber={pageNum}
                zoom={zoom}
                setRef={(ref) => setPageRef(pageNum, ref)}
                annotations={getAnnotationsForPage(pageNum)}
                selectedAnnotationId={selectedAnnotationId}
                onAnnotationClick={handleAnnotationClick}
                onTextSelection={handleTextSelection}
                containerRef={containerRef}
              />
            ))}
          </div>

          {/* Highlight toolbar on text selection */}
          {textSelection && (
            <HighlightToolbar
              selection={textSelection}
              onHighlight={handleCreateHighlight}
              onColorChange={setColor}
              currentColor={highlightColor}
              onClose={() => setTextSelection(null)}
              containerRef={containerRef}
            />
          )}

          {/* Annotation popover */}
          {popoverAnnotation && popoverPosition && (
            <AnnotationPopover
              annotation={popoverAnnotation}
              onUpdateComment={updateComment}
              onUpdateColor={updateColor}
              onDelete={deleteAnnotation}
              onClose={handleClosePopover}
              position={popoverPosition}
            />
          )}
        </div>

        {/* Annotation sidebar */}
        {showAnnotationSidebar && (
          <div className={styles.annotationSidebar}>
            <AnnotationSidebar
              annotations={annotations}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={selectAnnotation}
              onUpdateComment={updateComment}
              onUpdateColor={updateColor}
              onDelete={deleteAnnotation}
              onNavigateToAnnotation={handleNavigateToAnnotation}
              onClose={() => setSidebar(false)}
            />
          </div>
        )}
      </div>

      {/* Fullscreen overlay for Notes/AI Chat */}
      {isFullscreen && splitViewEnabled && <FullscreenOverlay />}
    </div>
  )
}

function PageCanvas({
  pdf,
  pageNumber,
  zoom,
  setRef,
  annotations,
  selectedAnnotationId,
  onAnnotationClick,
  onTextSelection,
  containerRef
}) {
  const canvasRef = useRef(null)
  const textLayerRef = useRef(null)
  const wrapperRef = useRef(null)
  const [isRendering, setIsRendering] = useState(false)
  const [pageViewport, setPageViewport] = useState(null)
  const renderTaskRef = useRef(null)
  const textRenderTaskRef = useRef(null)

  // Set ref for parent to track
  useEffect(() => {
    if (setRef) {
      setRef(wrapperRef.current)
    }
  }, [setRef])

  // Text selection tracking
  const { selection, clearSelection } = useTextSelection({
    containerRef: wrapperRef,
    currentPage: pageNumber,
    onSelectionChange: (sel) => {
      if (sel) {
        onTextSelection?.({ ...sel, page: pageNumber })
      }
    }
  })

  useEffect(() => {
    let cancelled = false

    const renderPage = async () => {
      if (!pdf || !canvasRef.current) return

      // Cancel any existing render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
        renderTaskRef.current = null
      }

      // Cancel any existing text render
      if (textRenderTaskRef.current) {
        try {
          textRenderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
        textRenderTaskRef.current = null
      }

      setIsRendering(true)

      try {
        // Check if PDF is still valid (not destroyed)
        if (!pdf.numPages) {
          setIsRendering(false)
          return
        }

        const page = await pdf.getPage(pageNumber)

        // Check if cancelled during async operation
        if (cancelled || !canvasRef.current) {
          setIsRendering(false)
          return
        }

        const scale = zoom / 100
        const viewport = page.getViewport({ scale: scale * 1.5 }) // 1.5 for higher resolution
        const displayViewport = page.getViewport({ scale }) // For text layer

        setPageViewport(displayViewport)

        const canvas = canvasRef.current
        const context = canvas.getContext('2d')

        canvas.height = viewport.height
        canvas.width = viewport.width
        canvas.style.width = `${viewport.width / 1.5}px`
        canvas.style.height = `${viewport.height / 1.5}px`

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        }

        const renderTask = page.render(renderContext)
        renderTaskRef.current = renderTask

        await renderTask.promise

        // Render text layer after canvas
        if (!cancelled && textLayerRef.current) {
          // Clear previous text layer
          textLayerRef.current.innerHTML = ''

          const textContent = await page.getTextContent()

          if (cancelled) return

          // Set text layer size to match display viewport
          textLayerRef.current.style.width = `${displayViewport.width}px`
          textLayerRef.current.style.height = `${displayViewport.height}px`

          // Use PDF.js text layer rendering
          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport: displayViewport
          })

          textRenderTaskRef.current = textLayer

          await textLayer.render()
        }

        if (!cancelled) {
          setIsRendering(false)
        }
      } catch (err) {
        if (!cancelled && err.name !== 'RenderingCancelledException') {
          // Don't log "Worker was destroyed" errors during document switches
          if (!err.message?.includes('Worker was destroyed')) {
            console.error('Page render error:', err)
          }
        }
        if (!cancelled) {
          setIsRendering(false)
        }
      }
    }

    renderPage()

    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
        renderTaskRef.current = null
      }
      if (textRenderTaskRef.current) {
        try {
          textRenderTaskRef.current.cancel()
        } catch (e) {
          // Ignore
        }
        textRenderTaskRef.current = null
      }
    }
  }, [pdf, pageNumber, zoom])

  return (
    <div
      className={styles.pageWrapper}
      ref={wrapperRef}
      data-page-number={pageNumber}
    >
      <canvas ref={canvasRef} className={styles.page} />
      <div ref={textLayerRef} className={styles.textLayer} />
      <AnnotationLayer
        annotations={annotations}
        selectedAnnotationId={selectedAnnotationId}
        onAnnotationClick={onAnnotationClick}
        scale={zoom}
      />
      {isRendering && (
        <div className={styles.pageLoading}>
          <Spinner size={20} />
        </div>
      )}
    </div>
  )
}
