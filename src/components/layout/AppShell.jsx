import { useEffect, useRef, useCallback, useState } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useAIStore } from '../../store/aiStore'
import Sidebar from './Sidebar'
import DocList from '../library/DocList'
import MainPanel from './MainPanel'
import MobileNav from './MobileNav'
import { SettingsModal } from '../settings'
import { ShareModal, ActivityDashboard, MoveFolderPicker } from '../sharing'
import { ChatHistoryModal } from '../ai'
import { QuickHelpModal } from '../help'
import { CitationExportModal } from '../citation'
import EditMetadataModal from '../metadata/EditMetadataModal'
import styles from './AppShell.module.css'

export default function AppShell() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)
  const showModal = useUIStore((s) => s.showModal)
  const setShowModal = useUIStore((s) => s.setShowModal)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const setDocListCollapsed = useUIStore((s) => s.setDocListCollapsed)
  const closeAllOverlays = useUIStore((s) => s.closeAllOverlays)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const toggleSplitView = useUIStore((s) => s.toggleSplitView)

  // Panel widths
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const docListWidth = useUIStore((s) => s.docListWidth)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  const setDocListWidth = useUIStore((s) => s.setDocListWidth)

  // Resize state
  const resizingRef = useRef(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const loadConversation = useAIStore((s) => s.loadConversation)

  const handleLoadConversation = (conversation) => {
    loadConversation(conversation)
    setActivePanel('ai')
  }

  // Handle resize mouse events
  const handleMouseDown = useCallback((panel, e) => {
    e.preventDefault()
    resizingRef.current = panel
    startXRef.current = e.clientX
    startWidthRef.current = panel === 'sidebar' ? sidebarWidth : docListWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [sidebarWidth, docListWidth])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizingRef.current) return

      const delta = e.clientX - startXRef.current
      const newWidth = startWidthRef.current + delta

      if (resizingRef.current === 'sidebar') {
        setSidebarWidth(newWidth)
      } else if (resizingRef.current === 'doclist') {
        setDocListWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setSidebarWidth, setDocListWidth])

  // Handle responsive breakpoints
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      const mobile = width < 640
      setIsMobile(mobile)

      if (width < 640) {
        setSidebarCollapsed(true)
        setDocListCollapsed(true)
      } else if (width < 900) {
        setSidebarCollapsed(false)
        setDocListCollapsed(true)
      } else {
        setSidebarCollapsed(false)
        setDocListCollapsed(false)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarCollapsed, setDocListCollapsed])

  // Handle backdrop click to close overlays on mobile
  const handleBackdropClick = useCallback(() => {
    if (isMobile) {
      closeAllOverlays()
    }
  }, [isMobile, closeAllOverlays])

  // Determine if backdrop should be shown (mobile with any panel open)
  const showBackdrop = isMobile && (!sidebarCollapsed || !docListCollapsed)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + Shift + S: Toggle split view
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        toggleSplitView()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleSplitView])

  return (
    <>
      <div className={`${styles.shell} ${isMobile ? styles.mobile : ''}`}>
        {/* Mobile backdrop overlay */}
        {showBackdrop && (
          <div
            className={styles.backdrop}
            onClick={handleBackdropClick}
            aria-hidden="true"
          />
        )}

        <div
          className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          <Sidebar isMobile={isMobile} />
        </div>
        {!sidebarCollapsed && !isMobile && (
          <div
            className={styles.resizeHandle}
            onMouseDown={(e) => handleMouseDown('sidebar', e)}
          />
        )}
        <div
          className={`${styles.docList} ${docListCollapsed ? styles.collapsed : ''}`}
          style={{ width: docListCollapsed ? 0 : docListWidth }}
        >
          <DocList isMobile={isMobile} />
        </div>
        {!docListCollapsed && !isMobile && (
          <div
            className={styles.resizeHandle}
            onMouseDown={(e) => handleMouseDown('doclist', e)}
          />
        )}
        <div className={styles.mainPanel}>
          <MainPanel isMobile={isMobile} />
        </div>

        {/* Mobile bottom navigation */}
        {isMobile && <MobileNav />}
      </div>

      {/* Modals */}
      {showModal === 'settings' && (
        <SettingsModal onClose={() => setShowModal(null)} />
      )}
      {showModal === 'share' && (
        <ShareModal onClose={() => setShowModal(null)} />
      )}
      {showModal === 'activity' && (
        <ActivityDashboard onClose={() => setShowModal(null)} />
      )}
      {showModal === 'move' && (
        <MoveFolderPicker onClose={() => setShowModal(null)} />
      )}
      {showModal === 'history' && (
        <ChatHistoryModal
          onClose={() => setShowModal(null)}
          onLoadConversation={handleLoadConversation}
        />
      )}
      {showModal === 'metadata' && (
        <EditMetadataModal onClose={() => setShowModal(null)} />
      )}
      {showModal === 'help' && (
        <QuickHelpModal onClose={() => setShowModal(null)} />
      )}
      {showModal === 'export-citations' && (
        <CitationExportModal onClose={() => setShowModal(null)} />
      )}
    </>
  )
}
