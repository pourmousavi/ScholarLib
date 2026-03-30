import { lazy, Suspense } from 'react'
import { useUIStore } from '../../store/uiStore'
import { Spinner } from '../ui'
import styles from './PDFViewer.module.css'

// Lazy load EmbedPDF viewer to avoid loading heavy WASM if not needed
const EmbedPDFViewer = lazy(() => import('./EmbedPDFViewer'))
import PDFViewer from './PDFViewer'

function ViewerLoading() {
  return (
    <div className={styles.viewer}>
      <div className={styles.loading}>
        <Spinner size={32} />
        <span className={styles.loadingText}>Loading viewer...</span>
      </div>
    </div>
  )
}

export default function ViewerSwitch(props) {
  const pdfViewer = useUIStore((s) => s.pdfViewer)

  if (pdfViewer === 'embedpdf') {
    return (
      <Suspense fallback={<ViewerLoading />}>
        <EmbedPDFViewer {...props} />
      </Suspense>
    )
  }

  return <PDFViewer {...props} />
}
