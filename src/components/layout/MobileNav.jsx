import { useUIStore } from '../../store/uiStore'
import { useLibraryStore } from '../../store/libraryStore'
import styles from './MobileNav.module.css'

export default function MobileNav() {
  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const setDocListCollapsed = useUIStore((s) => s.setDocListCollapsed)
  const closeAllOverlays = useUIStore((s) => s.closeAllOverlays)

  const selectedDocId = useLibraryStore((s) => s.selectedDocId)

  // Determine active tab based on current state
  const getActiveTab = () => {
    if (!sidebarCollapsed) return 'library'
    if (!docListCollapsed) return 'docs'
    return activePanel
  }

  const currentTab = getActiveTab()

  const handleLibrary = () => {
    closeAllOverlays()
    setSidebarCollapsed(false)
  }

  const handleDocs = () => {
    closeAllOverlays()
    setDocListCollapsed(false)
  }

  const handlePdf = () => {
    closeAllOverlays()
    setActivePanel('pdf')
  }

  const handleChat = () => {
    closeAllOverlays()
    setActivePanel('ai')
  }

  const handleNotes = () => {
    closeAllOverlays()
    setActivePanel('notes')
  }

  return (
    <nav className={styles.nav}>
      <button
        className={`${styles.tab} ${currentTab === 'library' ? styles.active : ''}`}
        onClick={handleLibrary}
        aria-label="Library"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
        <span>Library</span>
      </button>

      <button
        className={`${styles.tab} ${currentTab === 'docs' ? styles.active : ''}`}
        onClick={handleDocs}
        aria-label="Documents"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span>Docs</span>
      </button>

      <button
        className={`${styles.tab} ${currentTab === 'pdf' ? styles.active : ''}`}
        onClick={handlePdf}
        disabled={!selectedDocId}
        aria-label="PDF"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>PDF</span>
      </button>

      <button
        className={`${styles.tab} ${currentTab === 'ai' ? styles.active : ''}`}
        onClick={handleChat}
        aria-label="AI Chat"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <span>Chat</span>
      </button>

      <button
        className={`${styles.tab} ${currentTab === 'notes' ? styles.active : ''}`}
        onClick={handleNotes}
        aria-label="Notes"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <span>Notes</span>
      </button>
    </nav>
  )
}
