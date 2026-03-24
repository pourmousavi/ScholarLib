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
  showAnnotationSidebar
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
