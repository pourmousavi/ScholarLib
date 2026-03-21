import { useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useAIStore } from '../../store/aiStore'
import Sidebar from './Sidebar'
import DocList from '../library/DocList'
import MainPanel from './MainPanel'
import { SettingsModal } from '../settings'
import { ShareModal, ActivityDashboard, MoveFolderPicker } from '../sharing'
import { ChatHistoryModal } from '../ai'
import { HelpModal } from '../help'
import EditMetadataModal from '../metadata/EditMetadataModal'
import styles from './AppShell.module.css'

export default function AppShell() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)
  const showModal = useUIStore((s) => s.showModal)
  const setShowModal = useUIStore((s) => s.setShowModal)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const setDocListCollapsed = useUIStore((s) => s.setDocListCollapsed)
  const setActivePanel = useUIStore((s) => s.setActivePanel)

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

  return (
    <>
      <div className={styles.shell}>
        <div
          className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          <Sidebar />
        </div>
        {!sidebarCollapsed && (
          <div
            className={styles.resizeHandle}
            onMouseDown={(e) => handleMouseDown('sidebar', e)}
          />
        )}
        <div
          className={`${styles.docList} ${docListCollapsed ? styles.collapsed : ''}`}
          style={{ width: docListCollapsed ? 0 : docListWidth }}
        >
          <DocList />
        </div>
        {!docListCollapsed && (
          <div
            className={styles.resizeHandle}
            onMouseDown={(e) => handleMouseDown('doclist', e)}
          />
        )}
        <div className={styles.mainPanel}>
          <MainPanel />
        </div>
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
        <HelpModal onClose={() => setShowModal(null)} />
      )}
    </>
  )
}
