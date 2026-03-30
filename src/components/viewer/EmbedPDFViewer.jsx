import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage, useScroll } from '@embedpdf/plugin-scroll/react'
import { DocumentContent, DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { ZoomPluginPackage, ZoomMode, useZoom, ZoomGestureWrapper } from '@embedpdf/plugin-zoom/react'
import { InteractionManagerPluginPackage, PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react'
import { TilingPluginPackage } from '@embedpdf/plugin-tiling/react'

import { useUIStore } from '../../store/uiStore'
import { Spinner, Btn } from '../ui'
import styles from './PDFViewer.module.css'
import toolbarStyles from './PDFToolbar.module.css'

// Inner toolbar that has access to EmbedPDF context
function EmbedPDFToolbar({
  documentId,
  totalPages,
  onToggleFullscreen,
  isFullscreen
}) {
  const { provides: zoom, state: zoomState } = useZoom(documentId)
  const { provides: scroll, state: scrollState } = useScroll(documentId)

  const currentZoom = zoomState?.currentZoomLevel
    ? Math.round(zoomState.currentZoomLevel * 100)
    : 100

  const currentPage = scrollState?.currentPage ?? 1

  const handleZoomIn = useCallback(() => {
    zoom?.zoomIn()
  }, [zoom])

  const handleZoomOut = useCallback(() => {
    zoom?.zoomOut()
  }, [zoom])

  const handlePrevPage = useCallback(() => {
    scroll?.scrollToPreviousPage()
  }, [scroll])

  const handleNextPage = useCallback(() => {
    scroll?.scrollToNextPage()
  }, [scroll])

  return (
    <div className={toolbarStyles.toolbar}>
      <div className={toolbarStyles.navigation}>
        <button
          className={toolbarStyles.navBtn}
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          title="Previous page"
        >
          ◂
        </button>
        <button
          className={toolbarStyles.navBtn}
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          title="Next page"
        >
          ▸
        </button>
        <span className={toolbarStyles.pageInfo}>
          Page {currentPage} / {totalPages}
        </span>
      </div>

      <div className={toolbarStyles.zoom}>
        <button
          className={toolbarStyles.zoomBtn}
          onClick={handleZoomOut}
          disabled={currentZoom <= 50}
          title="Zoom out"
        >
          −
        </button>
        <span className={toolbarStyles.zoomLevel}>{currentZoom}%</span>
        <button
          className={toolbarStyles.zoomBtn}
          onClick={handleZoomIn}
          disabled={currentZoom >= 200}
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className={toolbarStyles.actions}>
        <button
          className={toolbarStyles.fullscreenBtn}
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? '⤓' : '⤢'}
        </button>
      </div>
    </div>
  )
}

// Content wrapper that handles document loading and rendering
function EmbedPDFContent({
  documentId,
  onTotalPagesChange,
  onToggleFullscreen,
  isFullscreen
}) {
  return (
    <DocumentContent documentId={documentId}>
      {({ isLoaded, document: pdfDoc, error: docError }) => {
        if (docError) {
          return (
            <div className={styles.error}>
              <span className={styles.errorIcon}>⚠</span>
              <span className={styles.errorText}>
                {docError.message || 'Failed to load PDF'}
              </span>
            </div>
          )
        }

        if (!isLoaded) {
          return (
            <div className={styles.loading}>
              <Spinner size={24} />
              <span className={styles.loadingText}>Loading PDF...</span>
            </div>
          )
        }

        // Update total pages when document loads
        const pageCount = pdfDoc?.pageCount ?? 0
        if (pageCount > 0) {
          // Use timeout to avoid setState during render
          setTimeout(() => onTotalPagesChange(pageCount), 0)
        }

        return (
          <>
            <EmbedPDFToolbar
              documentId={documentId}
              totalPages={pageCount}
              onToggleFullscreen={onToggleFullscreen}
              isFullscreen={isFullscreen}
            />
            <div className={styles.viewerContent}>
              <div className={styles.container}>
                <ZoomGestureWrapper
                  documentId={documentId}
                  enablePinch
                  enableWheel
                >
                  <Viewport
                    documentId={documentId}
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      height: '100%',
                      width: '100%'
                    }}
                  >
                    <Scroller
                      documentId={documentId}
                      renderPage={({ width, height, pageIndex }) => (
                        <PagePointerProvider
                          documentId={documentId}
                          pageIndex={pageIndex}
                        >
                          <div
                            className={styles.pageWrapper}
                            style={{
                              width,
                              height,
                              maxWidth: 'none'
                            }}
                            data-page-number={pageIndex + 1}
                          >
                            <RenderLayer
                              documentId={documentId}
                              pageIndex={pageIndex}
                            />
                          </div>
                        </PagePointerProvider>
                      )}
                    />
                  </Viewport>
                </ZoomGestureWrapper>
              </div>
            </div>
          </>
        )
      }}
    </DocumentContent>
  )
}

export default function EmbedPDFViewer({ url, docId, onTextExtracted }) {
  const pdfDefaultZoom = useUIStore((s) => s.pdfDefaultZoom)
  const setFullscreenOverlayVisible = useUIStore((s) => s.setFullscreenOverlayVisible)
  const { engine, isLoading: engineLoading } = usePdfiumEngine()

  const viewerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState(null)

  // Create plugins with document URL - memoized to prevent re-creation
  const plugins = useMemo(() => {
    if (!url) return []

    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{ url }],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage, {
        defaultPageGap: 16,
      }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: pdfDefaultZoom / 100,
        minZoomLevel: 0.5,
        maxZoomLevel: 2.0,
      }),
    ]
  }, [url, pdfDefaultZoom])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen()
      setIsFullscreen(true)
      setFullscreenOverlayVisible(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
      setFullscreenOverlayVisible(false)
    }
  }, [setFullscreenOverlayVisible])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement
      setIsFullscreen(isNowFullscreen)
      if (!isNowFullscreen) {
        setFullscreenOverlayVisible(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [setFullscreenOverlayVisible])

  // Reset state when URL changes
  useEffect(() => {
    setTotalPages(0)
    setError(null)
  }, [url])

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

  if (engineLoading) {
    return (
      <div className={styles.viewer}>
        <div className={styles.loading}>
          <Spinner size={32} />
          <span className={styles.loadingText}>Loading PDF engine...</span>
        </div>
      </div>
    )
  }

  if (!engine) {
    return (
      <div className={styles.viewer}>
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠</span>
          <span className={styles.errorText}>Failed to load PDF engine</span>
          <Btn onClick={() => window.location.reload()}>Reload</Btn>
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
          <Btn onClick={() => setError(null)}>Retry</Btn>
        </div>
      </div>
    )
  }

  if (plugins.length === 0) {
    return (
      <div className={styles.viewer}>
        <div className={styles.loading}>
          <Spinner size={24} />
          <span className={styles.loadingText}>Initializing viewer...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.viewer} ref={viewerRef}>
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) => {
          if (!activeDocumentId) {
            return (
              <div className={styles.loading}>
                <Spinner size={24} />
                <span className={styles.loadingText}>Loading PDF...</span>
              </div>
            )
          }

          return (
            <EmbedPDFContent
              documentId={activeDocumentId}
              onTotalPagesChange={setTotalPages}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
            />
          )
        }}
      </EmbedPDF>
    </div>
  )
}
