import { useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'
import Sidebar from './Sidebar'
import DocList from '../library/DocList'
import MainPanel from './MainPanel'
import { SettingsModal } from '../settings'
import styles from './AppShell.module.css'

export default function AppShell() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)
  const showModal = useUIStore((s) => s.showModal)
  const setShowModal = useUIStore((s) => s.setShowModal)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const setDocListCollapsed = useUIStore((s) => s.setDocListCollapsed)

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
        <div className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
          <Sidebar />
        </div>
        <div className={`${styles.docList} ${docListCollapsed ? styles.collapsed : ''}`}>
          <DocList />
        </div>
        <div className={styles.mainPanel}>
          <MainPanel />
        </div>
      </div>

      {/* Modals */}
      {showModal === 'settings' && (
        <SettingsModal onClose={() => setShowModal(null)} />
      )}
    </>
  )
}
