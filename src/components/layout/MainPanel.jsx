import { useUIStore } from '../../store/uiStore'
import { useLibraryStore } from '../../store/libraryStore'
import PDFViewer from '../viewer/PDFViewer'
import styles from './MainPanel.module.css'

// Test PDF URL for development (public domain PDF)
const TEST_PDF_URL = 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.pdf'

export default function MainPanel() {
  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const toggleDocList = useUIStore((s) => s.toggleDocList)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)

  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const documents = useLibraryStore((s) => s.documents)
  const selectedDoc = selectedDocId ? documents[selectedDocId] : null

  const panels = [
    { id: 'pdf', label: 'PDF' },
    { id: 'ai', label: 'AI Chat' },
    { id: 'notes', label: 'Notes' }
  ]

  // For now, use test PDF URL. In Stage 06, this will be Box streaming URL
  const pdfUrl = selectedDoc ? TEST_PDF_URL : null

  const handleTextExtracted = (text) => {
    // Will be used in Stage 11 for indexing
    console.log('Extracted text length:', text.length)
  }

  return (
    <div className={styles.panel}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.left}>
          {(sidebarCollapsed || docListCollapsed) && (
            <button
              className={styles.menuBtn}
              onClick={() => {
                if (sidebarCollapsed) toggleSidebar()
                else if (docListCollapsed) toggleDocList()
              }}
            >
              ☰
            </button>
          )}
          <span className={styles.docTitle}>
            {selectedDoc?.metadata?.title || 'No document selected'}
          </span>
        </div>
        <div className={styles.tabs}>
          {panels.map((p) => (
            <button
              key={p.id}
              className={`${styles.tab} ${activePanel === p.id ? styles.active : ''}`}
              onClick={() => setActivePanel(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Panel content */}
      <div className={styles.content}>
        {activePanel === 'pdf' && (
          <PDFViewer
            url={pdfUrl}
            docId={selectedDocId}
            onTextExtracted={handleTextExtracted}
          />
        )}
        {activePanel === 'ai' && (
          <div className={styles.placeholder}>
            AI Chat (Stage 09)
          </div>
        )}
        {activePanel === 'notes' && (
          <div className={styles.placeholder}>
            Notes Editor (Stage 08)
          </div>
        )}
      </div>
    </div>
  )
}
