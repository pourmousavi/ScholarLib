import { useUIStore } from '../../store/uiStore'
import { useLibraryStore } from '../../store/libraryStore'
import styles from './MainPanel.module.css'

export default function MainPanel() {
  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const toggleDocList = useUIStore((s) => s.toggleDocList)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)
  const selectedDoc = useLibraryStore((s) => s.getSelectedDoc())

  const panels = [
    { id: 'pdf', label: 'PDF' },
    { id: 'ai', label: 'AI Chat' },
    { id: 'notes', label: 'Notes' }
  ]

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
          <div className={styles.placeholder}>
            PDF Viewer (Stage 05)
          </div>
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
