import { Btn } from '../ui'
import styles from './PDFToolbar.module.css'

export default function PDFToolbar({
  currentPage,
  totalPages,
  zoom,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onToggleFullscreen,
  isFullscreen,
  annotationCount = 0,
  onToggleAnnotations,
  showAnnotationSidebar,
  areaSelectMode = false,
  onToggleAreaSelect,
  onExportAnnotations
}) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.navigation}>
        <button
          className={styles.navBtn}
          onClick={onPrevPage}
          disabled={currentPage <= 1}
          title="Previous page"
        >
          ◂
        </button>
        <button
          className={styles.navBtn}
          onClick={onNextPage}
          disabled={currentPage >= totalPages}
          title="Next page"
        >
          ▸
        </button>
        <span className={styles.pageInfo}>
          Page {currentPage} / {totalPages}
        </span>
      </div>

      <div className={styles.zoom}>
        <button
          className={styles.zoomBtn}
          onClick={onZoomOut}
          disabled={zoom <= 50}
          title="Zoom out"
        >
          −
        </button>
        <span className={styles.zoomLevel}>{zoom}%</span>
        <button
          className={styles.zoomBtn}
          onClick={onZoomIn}
          disabled={zoom >= 200}
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className={styles.actions}>
        {/* Annotation tools - hidden on mobile */}
        <div className={styles.annotationTools}>
          {/* Area selection mode toggle */}
          <button
            className={`${styles.toolBtn} ${areaSelectMode ? styles.active : ''}`}
            onClick={onToggleAreaSelect}
            title="Select area (for figures/tables)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2"/>
              <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeOpacity="0.3"/>
            </svg>
          </button>

          {/* Annotations sidebar toggle */}
          <button
            className={`${styles.annotationBtn} ${showAnnotationSidebar ? styles.active : ''}`}
            onClick={onToggleAnnotations}
            title="Toggle annotations sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.54 3.5l4.95 4.95-9.9 9.9H5.64v-4.95l9.9-9.9zm1.41-1.41l-1.41 1.41-4.95-4.95 1.41-1.41 4.95 4.95zm-12.03 17.41h12v2h-12v-2z"/>
            </svg>
            {annotationCount > 0 && (
              <span className={styles.annotationCount}>{annotationCount}</span>
            )}
          </button>

          {/* Export annotations */}
          {annotationCount > 0 && (
            <button
              className={styles.toolBtn}
              onClick={onExportAnnotations}
              title="Export annotations"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          )}
        </div>

        <button
          className={styles.fullscreenBtn}
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? '⤓' : '⤢'}
        </button>
      </div>
    </div>
  )
}
