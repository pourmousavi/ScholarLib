import { useEffect, useRef, useState, useCallback } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react'
import { DocumentContent, DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { ZoomPluginPackage, ZoomMode, useZoom, ZoomGestureWrapper } from '@embedpdf/plugin-zoom/react'
import { InteractionManagerPluginPackage, PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react'
import { TilingPluginPackage } from '@embedpdf/plugin-tiling/react'

import { useUIStore } from '../../store/uiStore'
import { Spinner, Btn } from '../ui'
import PDFToolbar from './PDFToolbar'
import styles from './PDFViewer.module.css'

// Zoom toolbar component for EmbedPDF
function EmbedPDFZoomToolbar({ documentId, onZoomChange }) {
  const { provides: zoom, state } = useZoom(documentId)

  useEffect(() => {
    if (state?.currentZoomLevel && onZoomChange) {
      onZoomChange(Math.round(state.currentZoomLevel * 100))
    }
  }, [state?.currentZoomLevel, onZoomChange])

  if (!zoom) return null

  return {
    zoom: state?.currentZoomLevel ? Math.round(state.currentZoomLevel * 100) : 100,
    zoomIn: () => zoom.zoomIn(),
    zoomOut: () => zoom.zoomOut(),
    resetZoom: () => zoom.requestZoom(ZoomMode.FitPage)
  }
}

export default function EmbedPDFViewer({ url, docId, onTextExtracted }) {
  const pdfDefaultZoom = useUIStore((s) => s.pdfDefaultZoom)
  const { engine, isLoading: engineLoading } = usePdfiumEngine()

  const viewerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(pdfDefaultZoom)
  const [error, setError] = useState(null)
  const [documentLoaded, setDocumentLoaded] = useState(false)

  // Create plugins with document URL
  const plugins = useCallback(() => {
    if (!url) return []

    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{ url }],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: pdfDefaultZoom / 100,
      }),
    ]
  }, [url, pdfDefaultZoom])

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 25, 200))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z - 25, 50))
  }, [])

  const handlePrevPage = useCallback(() => {
    setCurrentPage(p => Math.max(1, p - 1))
  }, [])

  const handleNextPage = useCallback(() => {
    setCurrentPage(p => Math.min(totalPages, p + 1))
  }, [totalPages])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen()
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

  // Reset state when URL changes
  useEffect(() => {
    setCurrentPage(1)
    setTotalPages(0)
    setDocumentLoaded(false)
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
          <Btn onClick={() => { setError(null); setDocumentLoaded(false) }}>Retry</Btn>
        </div>
      </div>
    )
  }

  const pluginList = plugins()

  return (
    <div className={styles.viewer} ref={viewerRef}>
      <PDFToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        annotationCount={0}
        onToggleAnnotations={() => {}}
        showAnnotationSidebar={false}
        areaSelectMode={false}
        onToggleAreaSelect={() => {}}
        onExportAnnotations={() => {}}
      />
      <div className={styles.viewerContent}>
        <div className={styles.container}>
          {pluginList.length > 0 && (
            <EmbedPDF engine={engine} plugins={pluginList}>
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
                  <DocumentContent documentId={activeDocumentId}>
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
                      if (pdfDoc?.pageCount && pdfDoc.pageCount !== totalPages) {
                        setTotalPages(pdfDoc.pageCount)
                        setDocumentLoaded(true)
                      }

                      return (
                        <ZoomGestureWrapper
                          documentId={activeDocumentId}
                          enablePinch
                          enableWheel
                        >
                          <Viewport
                            documentId={activeDocumentId}
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              height: '100%',
                              width: '100%'
                            }}
                          >
                            <Scroller
                              documentId={activeDocumentId}
                              renderPage={({ width, height, pageIndex }) => (
                                <PagePointerProvider
                                  documentId={activeDocumentId}
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
                                      documentId={activeDocumentId}
                                      pageIndex={pageIndex}
                                    />
                                  </div>
                                </PagePointerProvider>
                              )}
                            />
                          </Viewport>
                        </ZoomGestureWrapper>
                      )
                    }}
                  </DocumentContent>
                )
              }}
            </EmbedPDF>
          )}
        </div>
      </div>
    </div>
  )
}
