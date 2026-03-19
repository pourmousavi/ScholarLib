import { useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useAIStore } from '../../store/aiStore'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import { ollamaService } from '../../services/ai/OllamaService'
import FolderTree from '../library/FolderTree'
import styles from './Sidebar.module.css'

export default function Sidebar() {
  const setShowModal = useUIStore((s) => s.setShowModal)
  const { canInstall, install } = usePWAInstall()

  const provider = useAIStore((s) => s.provider)
  const model = useAIStore((s) => s.model)
  const isAvailable = useAIStore((s) => s.isAvailable)
  const setAvailable = useAIStore((s) => s.setAvailable)
  const setChecking = useAIStore((s) => s.setChecking)

  // Check Ollama availability on mount
  useEffect(() => {
    const checkOllama = async () => {
      if (provider === 'ollama') {
        setChecking(true)
        const available = await ollamaService.isAvailable()
        setAvailable(available)
      }
    }

    checkOllama()
  }, [provider, setAvailable, setChecking])

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
        {canInstall && (
          <button
            className={styles.installBtn}
            onClick={install}
            title="Install ScholarLib as an app"
          >
            <span className={styles.installIcon}>⬇</span>
            Install App
          </button>
        )}
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
          <span className={`${styles.aiDot} ${isAvailable ? styles.available : ''}`} />
          <span className={styles.aiText}>
            {isAvailable
              ? `${provider} · ${model} · local`
              : `${provider} · offline`}
          </span>
        </div>
      </div>
    </div>
  )
}
