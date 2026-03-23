import { useState, useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useAIStore } from '../../store/aiStore'
import { useLibraryStore } from '../../store/libraryStore'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import { ollamaService } from '../../services/ai/OllamaService'
import { webllmService } from '../../services/ai/WebLLMService'
import { claudeService } from '../../services/ai/ClaudeService'
import { openaiService } from '../../services/ai/OpenAIService'
import { settingsService } from '../../services/settings/SettingsService'
import FolderTree from '../library/FolderTree'
import TagsList from '../library/TagsList'
import styles from './Sidebar.module.css'

export default function Sidebar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showResults, setShowResults] = useState(false)

  // Resizable divider state
  const [folderHeight, setFolderHeight] = useState(() => {
    const saved = localStorage.getItem('sv_folder_height')
    return saved ? parseInt(saved, 10) : 60 // Default 60% for folders
  })
  const [isDragging, setIsDragging] = useState(false)
  const treeContainerRef = useRef(null)

  const setShowModal = useUIStore((s) => s.setShowModal)
  const { canInstall, install } = usePWAInstall()

  const provider = useAIStore((s) => s.provider)
  const model = useAIStore((s) => s.model)
  const isAvailable = useAIStore((s) => s.isAvailable)
  const setAvailable = useAIStore((s) => s.setAvailable)
  const setChecking = useAIStore((s) => s.setChecking)

  const documents = useLibraryStore((s) => s.documents)
  const folders = useLibraryStore((s) => s.folders)
  const setSelectedDocId = useLibraryStore((s) => s.setSelectedDocId)
  const setSelectedFolderId = useLibraryStore((s) => s.setSelectedFolderId)

  const webllmStatus = useAIStore((s) => s.webllmStatus)
  const setWebLLMStatus = useAIStore((s) => s.setWebLLMStatus)
  const setWebLLMProgress = useAIStore((s) => s.setWebLLMProgress)

  // Check AI availability on mount and when provider changes
  useEffect(() => {
    const checkAvailability = async () => {
      setChecking(true)
      let available = false

      switch (provider) {
        case 'ollama':
          available = await ollamaService.isAvailable()
          break
        case 'webllm':
          // Check if already ready
          if (webllmService.isReady()) {
            available = true
          } else if (webllmService.isSupported()) {
            // Auto-initialize WebLLM (model files are cached in browser)
            setWebLLMStatus('downloading')
            try {
              const savedModel = localStorage.getItem('sv_webllm_model') || 'Llama-3.2-3B-Instruct-q4f32_1-MLC'
              await webllmService.initialize(savedModel, (progress) => {
                setWebLLMProgress(progress.progress * 100)
              })
              setWebLLMStatus('ready')
              available = true
            } catch (error) {
              console.error('WebLLM auto-init failed:', error)
              setWebLLMStatus('idle')
              available = false
            }
          }
          break
        case 'claude':
          available = claudeService.isConfigured()
          break
        case 'openai':
          available = openaiService.isConfigured()
          break
        case 'none':
          available = false
          break
        default:
          available = false
      }

      setAvailable(available)
      setChecking(false)
    }

    checkAvailability()
  }, [provider, setAvailable, setChecking, setWebLLMStatus, setWebLLMProgress])

  // Search functionality
  const handleSearch = (query) => {
    setSearchQuery(query)

    if (!query.trim()) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    const lowerQuery = query.toLowerCase()
    const results = []

    // Search documents
    Object.values(documents).forEach(doc => {
      const title = doc.metadata?.title || doc.filename || ''
      const authors = (doc.metadata?.authors || []).map(a => `${a.first} ${a.last}`).join(' ')
      const journal = doc.metadata?.journal || ''
      const keywords = (doc.metadata?.keywords || []).join(' ')

      const searchText = `${title} ${authors} ${journal} ${keywords}`.toLowerCase()

      if (searchText.includes(lowerQuery)) {
        results.push({
          type: 'document',
          id: doc.id,
          title: title || doc.filename,
          subtitle: authors || 'Unknown author',
          folderId: doc.folder_id
        })
      }
    })

    // Search folders
    folders.forEach(folder => {
      if (folder.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'folder',
          id: folder.id,
          title: folder.name,
          subtitle: 'Folder'
        })
      }
    })

    setSearchResults(results.slice(0, 10)) // Limit to 10 results
    setShowResults(true)
  }

  const handleResultClick = (result) => {
    if (result.type === 'document') {
      setSelectedFolderId(result.folderId)
      setSelectedDocId(result.id)
    } else if (result.type === 'folder') {
      setSelectedFolderId(result.id)
    }
    setSearchQuery('')
    setShowResults(false)
  }

  // Get provider display info
  const getProviderInfo = () => {
    const providerNames = {
      ollama: 'Ollama',
      webllm: 'WebLLM',
      claude: 'Claude',
      openai: 'OpenAI',
      none: 'AI Disabled'
    }

    const providerName = providerNames[provider] || provider

    if (provider === 'none') {
      return { name: 'AI Disabled', status: '' }
    }

    // Special handling for WebLLM loading state
    if (provider === 'webllm' && webllmStatus === 'downloading') {
      return { name: providerName, status: 'loading...' }
    }

    if (isAvailable) {
      const modelName = model?.split('/').pop()?.split('-')[0] || model || ''
      return {
        name: providerName,
        status: modelName ? `${modelName} ready` : 'ready'
      }
    }

    return { name: providerName, status: 'offline' }
  }

  const providerInfo = getProviderInfo()

  // Resizable divider handlers
  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      if (!treeContainerRef.current) return

      const container = treeContainerRef.current
      const rect = container.getBoundingClientRect()
      const relativeY = e.clientY - rect.top
      const percentage = Math.min(Math.max((relativeY / rect.height) * 100, 20), 80)

      setFolderHeight(percentage)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Save to localStorage
      localStorage.setItem('sv_folder_height', folderHeight.toString())
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, folderHeight])

  return (
    <div className={styles.sidebar}>
      {/* Logo area */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>S</div>
        <div className={styles.logoText}>
          <span className={styles.appName}>ScholarLib</span>
          <span className={styles.userName}>
            {settingsService.getUserName() || 'Set up your profile'}
          </span>
        </div>
      </div>

      {/* Search bar */}
      <div className={styles.searchWrapper}>
        <div className={styles.search}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search library..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchQuery && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
          />
        </div>

        {/* Search results dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className={styles.searchResults}>
            {searchResults.map(result => (
              <button
                key={`${result.type}-${result.id}`}
                className={styles.searchResult}
                onClick={() => handleResultClick(result)}
              >
                <span className={styles.resultIcon}>
                  {result.type === 'folder' ? '📁' : '📄'}
                </span>
                <div className={styles.resultText}>
                  <span className={styles.resultTitle}>{result.title}</span>
                  <span className={styles.resultSubtitle}>{result.subtitle}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {showResults && searchQuery && searchResults.length === 0 && (
          <div className={styles.searchResults}>
            <div className={styles.noResults}>No results found</div>
          </div>
        )}
      </div>

      {/* Folder tree and Tags with resizable divider */}
      <div className={styles.tree} ref={treeContainerRef}>
        <div className={styles.foldersSection} style={{ height: `${folderHeight}%` }}>
          <FolderTree />
        </div>
        <div
          className={`${styles.divider} ${isDragging ? styles.dragging : ''}`}
          onMouseDown={handleDividerMouseDown}
        >
          <div className={styles.dividerLine} />
          <div className={styles.dividerHandle} />
        </div>
        <div className={styles.tagsSection} style={{ height: `${100 - folderHeight}%` }}>
          <TagsList />
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        {canInstall && (
          <button
            className={styles.installBtn}
            onClick={install}
            title="Install ScholarLib as an app"
          >
            <svg className={styles.btnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Install App
          </button>
        )}
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={() => setShowModal('help')}
            title="Help & Documentation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
            </svg>
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => setShowModal('history')}
            title="AI chat history"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => setShowModal('settings')}
            title="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </div>
        <div className={styles.aiStatus}>
          <span className={`${styles.aiDot} ${isAvailable ? styles.available : ''}`} />
          <span className={styles.aiText}>
            {providerInfo.name}
            {providerInfo.status && <span className={styles.aiStatusText}> · {providerInfo.status}</span>}
          </span>
        </div>
      </div>
    </div>
  )
}
