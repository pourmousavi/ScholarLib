import { useUIStore } from '../../store/uiStore'
import FolderTree from '../library/FolderTree'
import { Input } from '../ui'
import styles from './Sidebar.module.css'

export default function Sidebar() {
  const setShowModal = useUIStore((s) => s.setShowModal)

  return (
    <div className={styles.sidebar}>
      {/* Logo area */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>S</div>
        <div className={styles.logoText}>
          <span className={styles.appName}>ScholarLib</span>
          <span className={styles.userName}>Dr. Ali Pourmousavi</span>
        </div>
      </div>

      {/* Search bar */}
      <div className={styles.search}>
        <span className={styles.searchIcon}>⌕</span>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search library..."
        />
      </div>

      {/* Folder tree */}
      <div className={styles.tree}>
        <FolderTree />
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={() => setShowModal('add')}
            title="Add document"
          >
            ⊕
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => setShowModal('history')}
            title="Chat history"
          >
            ◎
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => setShowModal('settings')}
            title="Settings"
          >
            ⚙
          </button>
        </div>
        <div className={styles.aiStatus}>
          <span className={styles.aiDot} />
          <span className={styles.aiText}>Ollama · llama3.2 · local</span>
        </div>
      </div>
    </div>
  )
}
