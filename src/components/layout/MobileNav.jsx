import { useState, useRef, useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useLibraryStore } from '../../store/libraryStore'
import { settingsService } from '../../services/settings/SettingsService'
import styles from './MobileNav.module.css'

export default function MobileNav() {
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const menuRef = useRef(null)

  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const setDocListCollapsed = useUIStore((s) => s.setDocListCollapsed)
  const closeAllOverlays = useUIStore((s) => s.closeAllOverlays)
  const setShowModal = useUIStore((s) => s.setShowModal)

  const selectedDocId = useLibraryStore((s) => s.selectedDocId)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMoreMenu(false)
      }
    }
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showMoreMenu])

  // Determine active tab based on current state
  const getActiveTab = () => {
    if (!sidebarCollapsed) return 'library'
    if (!docListCollapsed) return 'docs'
    return activePanel
  }

  const currentTab = getActiveTab()

  const handleLibrary = () => {
    setShowMoreMenu(false)
    closeAllOverlays()
    setSidebarCollapsed(false)
  }

  const handleDocs = () => {
    setShowMoreMenu(false)
    closeAllOverlays()
    setDocListCollapsed(false)
  }

  const handleChat = () => {
    setShowMoreMenu(false)
    closeAllOverlays()
    setActivePanel('ai')
  }

  const handleNotes = () => {
    setShowMoreMenu(false)
    closeAllOverlays()
    setActivePanel('notes')
  }

  const handleMore = () => {
    setShowMoreMenu(!showMoreMenu)
  }

  const handlePdf = () => {
    setShowMoreMenu(false)
    closeAllOverlays()
    setActivePanel('pdf')
  }

  const handleWiki = () => {
    setShowMoreMenu(false)
    closeAllOverlays()
    setActivePanel('wiki')
  }

  const handleSettings = () => {
    setShowMoreMenu(false)
    setShowModal('settings')
  }

  const handleHistory = () => {
    setShowMoreMenu(false)
    setShowModal('history')
  }

  const handleHelp = () => {
    setShowMoreMenu(false)
    setShowModal('help')
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

      {/* More menu with Settings, History, Help, and PDF access */}
      <div className={styles.moreContainer} ref={menuRef}>
        <button
          className={`${styles.tab} ${showMoreMenu ? styles.active : ''}`}
          onClick={handleMore}
          aria-label="More options"
          aria-expanded={showMoreMenu}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="12" cy="5" r="1"/>
            <circle cx="12" cy="19" r="1"/>
          </svg>
          <span>More</span>
        </button>

        {showMoreMenu && (
          <div className={styles.moreMenu}>
            <button className={styles.menuItem} onClick={handlePdf} disabled={!selectedDocId}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span>View PDF</span>
            </button>
            <button className={styles.menuItem} onClick={handleHistory}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Chat History</span>
            </button>
            {settingsService.getWikiEnabled() && (
              <button className={styles.menuItem} onClick={handleWiki}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z"/>
                  <path d="M8 7h7M8 11h8M8 15h5"/>
                </svg>
                <span>Wiki</span>
              </button>
            )}
            <button className={styles.menuItem} onClick={handleSettings}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
              <span>Settings</span>
            </button>
            <button className={styles.menuItem} onClick={handleHelp}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Help</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
