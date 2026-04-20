import { lazy, Suspense } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useLibraryStore } from '../../store/libraryStore'
import { Spinner } from '../ui'
import styles from './PDFViewer.module.css'

// Lazy load EmbedPDF viewer to avoid loading heavy WASM if not needed
const EmbedPDFViewer = lazy(() => import('./EmbedPDFViewer'))
const MarkdownViewer = lazy(() => import('./MarkdownViewer'))
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
  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const documents = useLibraryStore((s) => s.documents)
  const doc = selectedDocId ? documents[selectedDocId] : null

  // News articles with markdown source and no PDF → render markdown
  const isMarkdownOnly = doc?.ai_chat_source_file?.endsWith('.md') && !doc?.box_path?.endsWith('.pdf')

  if (isMarkdownOnly) {
    return (
      <Suspense fallback={<ViewerLoading />}>
        <MarkdownViewer doc={doc} />
      </Suspense>
    )
  }

  if (pdfViewer === 'embedpdf') {
    return (
      <Suspense fallback={<ViewerLoading />}>
        <EmbedPDFViewer {...props} />
      </Suspense>
    )
  }

  return <PDFViewer {...props} />
}
