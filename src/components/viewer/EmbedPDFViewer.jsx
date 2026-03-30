import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF } from '@embedpdf/core/react'
import { usePdfiumEngine } from '@embedpdf/engines/react'
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react'
import { Scroller, ScrollPluginPackage, useScroll } from '@embedpdf/plugin-scroll/react'
import { DocumentContent, DocumentManagerPluginPackage, useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { ZoomPluginPackage, useZoom, ZoomGestureWrapper } from '@embedpdf/plugin-zoom/react'
import { InteractionManagerPluginPackage, PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react'
import { TilingPluginPackage } from '@embedpdf/plugin-tiling/react'
import {
  AnnotationPluginPackage,
  AnnotationLayer,
  useAnnotation,
  useAnnotationCapability
} from '@embedpdf/plugin-annotation/react'
import {
  SelectionPluginPackage,
  SelectionLayer,
  useSelectionCapability
} from '@embedpdf/plugin-selection/react'
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react'
import { ExportPluginPackage, useExport } from '@embedpdf/plugin-export/react'

import { useUIStore } from '../../store/uiStore'
import { useEmbedPDFAnnotations } from '../../hooks/useEmbedPDFAnnotations'
import { useEmbedPDFTextExtraction } from '../../hooks/useEmbedPDFLoader'
import { ANNOTATION_COLORS, DEFAULT_HIGHLIGHT_COLOR } from '../../services/annotations'
import { Spinner, Btn } from '../ui'
import { AnnotationSidebar, AnnotationPopover } from '../annotations'
import styles from './PDFViewer.module.css'
import toolbarStyles from './PDFToolbar.module.css'

// Color picker component for annotation toolbar
function ColorPicker({ currentColor, onColorChange, colors }) {
  return (
    <div className={toolbarStyles.colorPicker}>
      {Object.entries(colors).map(([name, hex]) => (
        <button
          key={name}
          className={`${toolbarStyles.colorSwatch} ${currentColor === hex ? toolbarStyles.active : ''}`}
          style={{ backgroundColor: hex }}
          onClick={() => onColorChange(hex)}
          title={name}
        />
      ))}
    </div>
  )
}

// Text selection menu that appears on text selection - positioned like Adobe Acrobat
function TextSelectionMenu({
  documentId,
  pageIndex,
  menuWrapperProps,
  rect,
  placement,
  selected,
  onHighlight,
  onUnderline,
  highlightColor
}) {
  const { provides: selectionCapability } = useSelectionCapability()

  // Helper to get selected text
  const getSelectedText = useCallback(async () => {
    if (!selectionCapability) return ''
    try {
      const docSelection = selectionCapability.forDocument(documentId)
      const textResult = docSelection.getSelectedText()
      let text = ''
      if (textResult && typeof textResult.toPromise === 'function') {
        text = await textResult.toPromise()
      } else if (textResult && typeof textResult.then === 'function') {
        text = await textResult
      } else {
        text = textResult || ''
      }
      return Array.isArray(text) ? text.join(' ') : text
    } catch (err) {
      console.warn('[EmbedPDF] Could not get selected text:', err)
      return ''
    }
  }, [selectionCapability, documentId])

  const handleHighlight = useCallback(async () => {
    if (!selectionCapability) return
    try {
      const docSelection = selectionCapability.forDocument(documentId)
      const formatted = docSelection.getFormattedSelection()
      const text = await getSelectedText()

      if (formatted && formatted.length > 0) {
        onHighlight(pageIndex, formatted, text)
        docSelection.clear?.()
      }
    } catch (e) {
      console.error('[EmbedPDF] Highlight creation failed:', e)
    }
  }, [selectionCapability, documentId, pageIndex, onHighlight, getSelectedText])

  const handleUnderline = useCallback(async () => {
    if (!selectionCapability) return
    try {
      const docSelection = selectionCapability.forDocument(documentId)
      const formatted = docSelection.getFormattedSelection()
      const text = await getSelectedText()

      if (formatted && formatted.length > 0) {
        onUnderline(pageIndex, formatted, text)
        docSelection.clear?.()
      }
    } catch (e) {
      console.error('[EmbedPDF] Underline creation failed:', e)
    }
  }, [selectionCapability, documentId, pageIndex, onUnderline, getSelectedText])

  const handleCopy = useCallback(async () => {
    if (!selectionCapability) return
    try {
      const docSelection = selectionCapability.forDocument(documentId)
      // Use built-in copyToClipboard if available
      if (docSelection.copyToClipboard) {
        docSelection.copyToClipboard()
      } else {
        // Fallback: get text and copy manually
        const text = await getSelectedText()
        if (text) {
          await navigator.clipboard.writeText(text)
        }
      }
      docSelection.clear?.()
    } catch (e) {
      console.error('[EmbedPDF] Copy failed:', e)
    }
  }, [selectionCapability, documentId, getSelectedText])

  // Don't render if not selected or no rect
  if (!selected || !rect) {
    return null
  }

  // Position the menu as a small floating toolbar ABOVE the selection
  // rect contains { origin: { x, y }, size: { width, height } }
  const rectX = rect.origin?.x ?? rect.x ?? 0
  const rectY = rect.origin?.y ?? rect.y ?? 0
  const rectWidth = rect.size?.width ?? rect.width ?? 100
  const rectHeight = rect.size?.height ?? rect.height ?? 20

  // Center the menu above the selection
  const menuWidth = 100 // approximate menu width
  const menuStyle = {
    position: 'absolute',
    left: Math.max(0, rectX + (rectWidth / 2) - (menuWidth / 2)),
    top: rectY - 44, // 36px menu height + 8px gap
    pointerEvents: 'auto',
    zIndex: 1000,
  }

  // If menu would go above the page, position it below the selection instead
  if (menuStyle.top < 0) {
    menuStyle.top = rectY + rectHeight + 8
  }

  return (
    <div
      ref={menuWrapperProps?.ref}
      style={menuStyle}
      className={styles.selectionMenu}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleHighlight() }}
        onMouseDown={(e) => e.stopPropagation()}
        className={styles.selectionMenuBtn}
        style={{ backgroundColor: highlightColor }}
        title="Highlight"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M15.54 3.5l4.95 4.95-9.9 9.9H5.64v-4.95l9.9-9.9z"/>
        </svg>
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnderline() }}
        onMouseDown={(e) => e.stopPropagation()}
        className={styles.selectionMenuBtn}
        title="Underline"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <path d="M6 3v7a6 6 0 0 0 12 0V3"/>
          <line x1="4" y1="21" x2="20" y2="21"/>
        </svg>
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy() }}
        onMouseDown={(e) => e.stopPropagation()}
        className={styles.selectionMenuBtn}
        title="Copy"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      </button>
    </div>
  )
}

// Inner toolbar with annotation tools
function EmbedPDFToolbar({
  documentId,
  totalPagesProp,
  onToggleFullscreen,
  isFullscreen,
  annotationCount,
  showAnnotationSidebar,
  onToggleSidebar,
  highlightColor,
  onColorChange,
  onExportAnnotations,
  onExportPDF,
  isExportingPDF,
  activeTool,
  onSetActiveTool
}) {
  const { provides: zoom, state: zoomState } = useZoom(documentId)
  const { provides: scroll, state: scrollState } = useScroll(documentId)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const currentZoom = zoomState?.currentZoomLevel
    ? Math.round(zoomState.currentZoomLevel * 100)
    : 100

  // Get current page from scroll state (1-indexed)
  const currentPage = scrollState?.currentPage ?? 1
  // Get total pages from scroll state, fallback to prop
  const totalPages = scrollState?.totalPages || scrollState?.pageCount || scrollState?.numPages || totalPagesProp || 0

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
        {/* Annotation tools */}
        <div className={toolbarStyles.annotationTools}>
          {/* Pen tool */}
          <button
            className={`${toolbarStyles.toolBtn} ${activeTool === 'ink' ? toolbarStyles.active : ''}`}
            onClick={() => onSetActiveTool(activeTool === 'ink' ? null : 'ink')}
            title="Freehand pen"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M12 19l7-7 3 3-7 7-3-3z"/>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
              <path d="M2 2l7.586 7.586"/>
              <circle cx="11" cy="11" r="2"/>
            </svg>
          </button>

          {/* Ink highlighter tool */}
          <button
            className={`${toolbarStyles.toolBtn} ${activeTool === 'inkHighlighter' ? toolbarStyles.active : ''}`}
            onClick={() => onSetActiveTool(activeTool === 'inkHighlighter' ? null : 'inkHighlighter')}
            title="Freehand highlighter"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M15.5 4l4 4L9 18.5V22H4v-5L14.5 6.5 18 3l1.5 1.5-4 4zm-3 8l-4-4-3 3v3h3l4-2z"/>
            </svg>
          </button>

          {/* Area/Rectangle selection tool */}
          <button
            className={`${toolbarStyles.toolBtn} ${activeTool === 'square' ? toolbarStyles.active : ''}`}
            onClick={() => onSetActiveTool(activeTool === 'square' ? null : 'square')}
            title="Select area (for figures/tables)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2"/>
              <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeOpacity="0.3"/>
            </svg>
          </button>

          {/* Note/Free text tool */}
          <button
            className={`${toolbarStyles.toolBtn} ${activeTool === 'freetext' ? toolbarStyles.active : ''}`}
            onClick={() => onSetActiveTool(activeTool === 'freetext' ? null : 'freetext')}
            title="Add text note"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              <line x1="9" y1="9" x2="15" y2="9"/>
              <line x1="9" y1="13" x2="13" y2="13"/>
            </svg>
          </button>

          {/* Color picker toggle */}
          <div style={{ position: 'relative' }}>
            <button
              className={toolbarStyles.toolBtn}
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Annotation color"
              style={{
                borderBottom: `3px solid ${highlightColor}`
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M12 3a9 9 0 100 18 1.5 1.5 0 001.5-1.5c0-.4-.15-.75-.4-1.02-.25-.28-.4-.63-.4-1.02a1.5 1.5 0 011.5-1.5h1.75a5 5 0 005-5c0-4.42-4.03-8-9-8z"/>
              </svg>
            </button>
            {showColorPicker && (
              <div
                className={styles.colorPickerPopover}
                onMouseLeave={() => setShowColorPicker(false)}
              >
                <ColorPicker
                  currentColor={highlightColor}
                  onColorChange={(color) => {
                    onColorChange(color)
                    setShowColorPicker(false)
                  }}
                  colors={ANNOTATION_COLORS}
                />
              </div>
            )}
          </div>

          {/* Annotations sidebar toggle */}
          <button
            className={`${toolbarStyles.annotationBtn} ${showAnnotationSidebar ? toolbarStyles.active : ''}`}
            onClick={onToggleSidebar}
            title="Toggle annotations sidebar"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M15.54 3.5l4.95 4.95-9.9 9.9H5.64v-4.95l9.9-9.9zm1.41-1.41l-1.41 1.41-4.95-4.95 1.41-1.41 4.95 4.95zm-12.03 17.41h12v2h-12v-2z"/>
            </svg>
            {annotationCount > 0 && (
              <span className={toolbarStyles.annotationCount}>{annotationCount}</span>
            )}
          </button>

          {/* Export annotations (Markdown) */}
          {annotationCount > 0 && (
            <button
              className={toolbarStyles.toolBtn}
              onClick={onExportAnnotations}
              title="Export annotations (Markdown)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          )}

          {/* Export PDF with embedded annotations */}
          {annotationCount > 0 && (
            <button
              className={toolbarStyles.toolBtn}
              onClick={onExportPDF}
              disabled={isExportingPDF}
              title="Download PDF with annotations"
            >
              {isExportingPDF ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" className={toolbarStyles.spinning}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm7-7h-4v2h4v3l4-4-4-4v3z"/>
                </svg>
              )}
            </button>
          )}
        </div>

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
  docId,
  totalPages,
  onTotalPagesChange,
  onToggleFullscreen,
  isFullscreen,
  defaultZoom
}) {
  // useAnnotation returns a scope for the document (for createAnnotation, etc.)
  const { provides: annotationScope } = useAnnotation(documentId)
  // useAnnotationCapability returns the capability (for onAnnotationEvent)
  const { provides: annotationCapability } = useAnnotationCapability()
  const { provides: exportApi } = useExport(documentId)
  const { provides: zoomApi, state: zoomState } = useZoom(documentId)
  const { provides: scrollApi, state: scrollState } = useScroll(documentId)

  // Force a viewport refresh on mount by setting the zoom level
  // This triggers the viewport to render and respects the default zoom setting
  const hasInitialized = useRef(false)
  useEffect(() => {
    if (hasInitialized.current || !zoomApi) return

    // Use a delay to ensure EmbedPDF has fully processed the document
    const timer = setTimeout(() => {
      const targetZoom = defaultZoom / 100

      try {
        if (typeof zoomApi.requestZoom === 'function') {
          zoomApi.requestZoom(targetZoom)
        } else if (typeof zoomApi.zoomOut === 'function') {
          // Fallback: trigger a zoom cycle to force render
          zoomApi.zoomOut()
          setTimeout(() => {
            if (typeof zoomApi.zoomIn === 'function') {
              zoomApi.zoomIn()
            }
          }, 50)
        }
      } catch (e) {
        // Zoom initialization failed, continue silently
      }

      hasInitialized.current = true
    }, 200)

    return () => clearTimeout(timer)
  }, [zoomApi, documentId, defaultZoom])

  // Reset initialization flag when document changes
  useEffect(() => {
    hasInitialized.current = false
  }, [documentId])

  // Use annotation management hook
  const {
    annotations,
    selectedAnnotationId,
    highlightColor,
    showAnnotationSidebar,
    annotationCount,
    createHighlight,
    createUnderline,
    updateComment,
    updateColor,
    deleteAnnotation,
    selectAnnotation,
    clearSelection,
    setColor,
    toggleSidebar,
    setSidebar
  } = useEmbedPDFAnnotations(docId, annotationScope, annotationCapability)

  // Popover state
  const [popoverAnnotation, setPopoverAnnotation] = useState(null)
  const [popoverPosition, setPopoverPosition] = useState(null)

  // Active drawing tool state (null, 'ink', 'inkHighlighter')
  const [activeTool, setActiveTool] = useState(null)

  // PDF export state
  const [isExportingPDF, setIsExportingPDF] = useState(false)

  // Handle tool change
  const handleSetActiveTool = useCallback((tool) => {
    setActiveTool(tool)
    if (annotationScope) {
      if (tool) {
        annotationScope.setActiveTool?.(tool)
      } else {
        annotationScope.setActiveTool?.(null)
      }
    }
  }, [annotationScope])

  // Handle highlight creation from text selection
  const handleHighlight = useCallback((pageIndex, selectionData, text) => {
    const textStr = typeof text === 'string' ? text : ''
    if (selectionData && selectionData.length > 0) {
      createHighlight(pageIndex, selectionData, textStr)
    }
  }, [createHighlight])

  // Handle underline creation
  const handleUnderline = useCallback((pageIndex, selectionData, text) => {
    const textStr = typeof text === 'string' ? text : ''

    if (selectionData && selectionData.length > 0) {
      createUnderline(pageIndex, selectionData, textStr)
    }
  }, [createUnderline])

  // Handle annotation click
  const handleAnnotationClick = useCallback((annotation) => {
    selectAnnotation(annotation.id)
    // Position popover - would need ref to get actual position
    setPopoverAnnotation(annotation)
    // TODO: Calculate position based on annotation bounds
    setPopoverPosition({ top: 100, left: 100 })
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
    // TODO: Scroll to page using EmbedPDF scroll API
    selectAnnotation(annotation.id)
  }, [selectAnnotation])

  // Export annotations as Markdown
  const handleExportAnnotations = useCallback(() => {
    // Use existing export functionality - import at top of file
    import('../../services/annotations/AnnotationExporter').then(({ exportToMarkdown }) => {
      const markdown = exportToMarkdown(annotations, {
        documentTitle: docId,
        includeImages: false
      })

      const blob = new Blob([markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `annotations-${docId || 'document'}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
  }, [annotations, docId])

  // Export PDF with embedded annotations
  const handleExportPDF = useCallback(async () => {
    if (!exportApi) {
      console.warn('Export API not available')
      return
    }

    setIsExportingPDF(true)

    try {
      // Export PDF with annotations embedded
      const pdfBlob = await exportApi.exportDocument({
        includeAnnotations: true,
        flattenAnnotations: false // Keep annotations editable in other viewers
      })

      // Create download link
      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${docId || 'document'}-annotated.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export PDF:', err)
      // Could show a toast notification here
    } finally {
      setIsExportingPDF(false)
    }
  }, [exportApi, docId])

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

        // Use the passed totalPages from DocumentLoader, fallback to pdfDoc.pageCount
        const pageCount = totalPages || pdfDoc?.pageCount || 0

        return (
          <>
            <EmbedPDFToolbar
              documentId={documentId}
              totalPagesProp={pageCount}
              onToggleFullscreen={onToggleFullscreen}
              isFullscreen={isFullscreen}
              annotationCount={annotationCount}
              showAnnotationSidebar={showAnnotationSidebar}
              onToggleSidebar={toggleSidebar}
              highlightColor={highlightColor}
              onColorChange={setColor}
              onExportAnnotations={handleExportAnnotations}
              onExportPDF={handleExportPDF}
              isExportingPDF={isExportingPDF}
              activeTool={activeTool}
              onSetActiveTool={handleSetActiveTool}
            />
            <div className={styles.viewerContent}>
              <div className={styles.embedpdfContainer}>
                <div className={styles.embedpdfViewport}>
                  <ZoomGestureWrapper
                    documentId={documentId}
                    enablePinch
                    enableWheel
                    style={{ height: '100%', width: '100%' }}
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
                            <SelectionLayer
                              documentId={documentId}
                              pageIndex={pageIndex}
                              textStyle={{
                                // Blue selection highlight like Adobe Acrobat
                                background: 'rgba(0, 120, 215, 0.35)'
                              }}
                              selectionMenu={(props) => (
                                <TextSelectionMenu
                                  {...props}
                                  documentId={documentId}
                                  pageIndex={pageIndex}
                                  onHighlight={handleHighlight}
                                  onUnderline={handleUnderline}
                                  highlightColor={highlightColor}
                                />
                              )}
                            />
                            <AnnotationLayer
                              documentId={documentId}
                              pageIndex={pageIndex}
                              resizeUI={{ size: 8, color: 'var(--color-primary)' }}
                            />
                          </div>
                        </PagePointerProvider>
                      )}
                    />
                  </Viewport>
                  </ZoomGestureWrapper>
                </div>
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
          </>
        )
      }}
    </DocumentContent>
  )
}

// Component that handles loading the PDF document using the document manager API
function DocumentLoader({
  pdfData,
  docId,
  activeDocumentId,
  onTotalPagesChange,
  onToggleFullscreen,
  isFullscreen,
  defaultZoom
}) {
  const { provides: documentManager } = useDocumentManagerCapability()
  const [isDocumentLoading, setIsDocumentLoading] = useState(false)
  const [documentError, setDocumentError] = useState(null)
  const [loadedPageCount, setLoadedPageCount] = useState(0)
  const [documentReady, setDocumentReady] = useState(false)
  const loadedDocRef = useRef(null)

  // Load document when we have pdfData and documentManager
  useEffect(() => {
    if (!documentManager || !pdfData) return

    // Skip if we already loaded this document
    if (loadedDocRef.current === pdfData) return

    const loadDocument = async () => {
      setIsDocumentLoading(true)
      setDocumentError(null)
      setDocumentReady(false)

      try {
        const result = await documentManager.openDocumentBuffer({
          buffer: pdfData,
          name: docId || 'document.pdf',
          autoActivate: true
        }).toPromise()

        loadedDocRef.current = pdfData

        const pageCount = result?.pageCount || result?.document?.pageCount || 0
        setLoadedPageCount(pageCount)
        if (pageCount > 0) {
          onTotalPagesChange(pageCount)
        }

        // Small delay to ensure EmbedPDF has processed the document
        setTimeout(() => {
          setDocumentReady(true)
        }, 50)
      } catch (err) {
        console.error('Failed to load document:', err)
        setDocumentError(err.message || 'Failed to load document')
      } finally {
        setIsDocumentLoading(false)
      }
    }

    loadDocument()
  }, [documentManager, pdfData, docId, onTotalPagesChange])

  if (documentError) {
    return (
      <div className={styles.error}>
        <span className={styles.errorIcon}>⚠</span>
        <span className={styles.errorText}>{documentError}</span>
      </div>
    )
  }

  if (!activeDocumentId || isDocumentLoading || !documentReady) {
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
      docId={docId}
      totalPages={loadedPageCount}
      onTotalPagesChange={onTotalPagesChange}
      onToggleFullscreen={onToggleFullscreen}
      isFullscreen={isFullscreen}
      defaultZoom={defaultZoom}
    />
  )
}

export default function EmbedPDFViewer({ url, docId, onTextExtracted }) {
  const pdfDefaultZoom = useUIStore((s) => s.pdfDefaultZoom)
  const setFullscreenOverlayVisible = useUIStore((s) => s.setFullscreenOverlayVisible)
  const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine({
    // Use CDN for WASM - this is the default but we're being explicit
    wasmUrl: 'https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@2/dist/pdfium.wasm'
  })

  const viewerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState(null)
  const [pdfData, setPdfData] = useState(null)
  const [isLoadingPdf, setIsLoadingPdf] = useState(false)

  // Fetch PDF as ArrayBuffer to avoid CORS issues with EmbedPDF
  useEffect(() => {
    if (!url) {
      setPdfData(null)
      return
    }

    const fetchPdf = async () => {
      setIsLoadingPdf(true)
      setError(null)
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        setPdfData(arrayBuffer)
      } catch (err) {
        console.error('Failed to fetch PDF:', err)
        setError(err.message || 'Failed to load PDF')
      } finally {
        setIsLoadingPdf(false)
      }
    }

    fetchPdf()
  }, [url])

  // Extract text for AI indexing using PDF.js fallback
  const { extractedText, isExtracting } = useEmbedPDFTextExtraction(url, {
    enabled: !!url && !!onTextExtracted
  })

  // Call onTextExtracted when text is available
  useEffect(() => {
    if (extractedText && onTextExtracted) {
      onTextExtracted(extractedText)
    }
  }, [extractedText, onTextExtracted])

  // Create plugins - memoized to prevent re-creation
  // Note: We load documents dynamically via useDocumentManagerCapability, not through initialDocuments
  const plugins = useMemo(() => {
    if (!pdfData) return []

    return [
      createPluginRegistration(DocumentManagerPluginPackage, {}),
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
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(HistoryPluginPackage),
      createPluginRegistration(AnnotationPluginPackage, {
        autoCommit: true, // Auto-commit annotations to trigger committed events
        selectAfterCreate: false // Don't auto-select to avoid UI issues
      }),
      createPluginRegistration(ExportPluginPackage),
    ]
  }, [pdfData, pdfDefaultZoom, docId])

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

  if (engineLoading || isLoadingPdf) {
    return (
      <div className={styles.viewer}>
        <div className={styles.loading}>
          <Spinner size={32} />
          <span className={styles.loadingText}>
            {engineLoading ? 'Loading PDF engine...' : 'Loading PDF...'}
          </span>
        </div>
      </div>
    )
  }

  if (!engine || engineError) {
    return (
      <div className={styles.viewer}>
        <div className={styles.error}>
          <span className={styles.errorIcon}>⚠</span>
          <span className={styles.errorText}>
            Failed to load PDF engine{engineError ? `: ${engineError.message}` : ''}
          </span>
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
        {({ activeDocumentId }) => (
          <DocumentLoader
            pdfData={pdfData}
            docId={docId}
            activeDocumentId={activeDocumentId}
            onTotalPagesChange={setTotalPages}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            defaultZoom={pdfDefaultZoom}
          />
        )}
      </EmbedPDF>
    </div>
  )
}
