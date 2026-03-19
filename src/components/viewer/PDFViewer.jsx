import { useEffect, useRef, useState, useCallback } from 'react'
import { usePDFLoader } from '../../hooks/usePDFLoader'
import { Spinner, Btn } from '../ui'
import PDFToolbar from './PDFToolbar'
import styles from './PDFViewer.module.css'

export default function PDFViewer({ url, docId, onTextExtracted }) {
  const {
    pdf,
    loading,
    error,
    currentPage,
    totalPages,
    zoom,
    extractedText,
    nextPage,
    prevPage,
    zoomIn,
    zoomOut,
    retry
  } = usePDFLoader(url)

  const containerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [renderedPages, setRenderedPages] = useState([])

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

    const renderPages = async () => {
      const pages = []
      for (let i = 1; i <= pdf.numPages; i++) {
        pages.push(i)
      }
      setRenderedPages(pages)
    }

    renderPages()
  }, [pdf])

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

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.parentElement?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  if (!url) {
    return (
      <div className={styles.viewer}>
        <div className={styles.placeholder}>
          <span className={styles.placeholderText}>Select a document to view</span>
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
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
      />
      <div className={styles.container} ref={containerRef}>
        <div className={styles.pages}>
          {renderedPages.map((pageNum) => (
            <PageCanvas
              key={pageNum}
              pdf={pdf}
              pageNumber={pageNum}
              zoom={zoom}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function PageCanvas({ pdf, pageNumber, zoom }) {
  const canvasRef = useRef(null)
  const [isRendering, setIsRendering] = useState(false)
  const renderTaskRef = useRef(null)

  useEffect(() => {
    const renderPage = async () => {
      if (!pdf || !canvasRef.current) return

      // Cancel any existing render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
      }

      setIsRendering(true)

      try {
        const page = await pdf.getPage(pageNumber)
        const scale = zoom / 100
        const viewport = page.getViewport({ scale: scale * 1.5 }) // 1.5 for higher resolution

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
        setIsRendering(false)
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Page render error:', err)
        }
        setIsRendering(false)
      }
    }

    renderPage()

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
      }
    }
  }, [pdf, pageNumber, zoom])

  return (
    <div className={styles.pageWrapper}>
      <canvas ref={canvasRef} className={styles.page} />
      {isRendering && (
        <div className={styles.pageLoading}>
          <Spinner size={20} />
        </div>
      )}
    </div>
  )
}
