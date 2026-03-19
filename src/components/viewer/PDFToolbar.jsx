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
  isFullscreen
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

      <button
        className={styles.fullscreenBtn}
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? '⤓' : '⤢'}
      </button>
    </div>
  )
}
