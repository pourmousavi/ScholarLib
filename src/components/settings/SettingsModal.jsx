import { useState, useEffect } from 'react'
import { useAIStore } from '../../store/aiStore'
import { useUIStore } from '../../store/uiStore'
import { useStorageStore } from '../../store/storageStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useIndexStore } from '../../store/indexStore'
import { settingsService } from '../../services/settings/SettingsService'
import { LibraryService } from '../../services/library/LibraryService'
import { indexService } from '../../services/indexing/IndexService'
import { ollamaService } from '../../services/ai/OllamaService'
import { webllmService } from '../../services/ai/WebLLMService'
import { claudeService } from '../../services/ai/ClaudeService'
import { openaiService } from '../../services/ai/OpenAIService'
import { getDeviceType, getDeviceName, getRecommendedProviders, DEVICE_TYPES, isWebLLMSuitable } from '../../utils/deviceDetection'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import MigrationWizard from '../migration/MigrationWizard'
import styles from './SettingsModal.module.css'

// SVG Icons for settings sections
const SectionIcons = {
  ai: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1.27c.34-.6.99-1 1.73-1a2 2 0 110 4c-.74 0-1.39-.4-1.73-1H21a7 7 0 01-7 7v1.27c.6.34 1 .99 1 1.73a2 2 0 11-4 0c0-.74.4-1.39 1-1.73V23a7 7 0 01-7-7H3.73c-.34.6-.99 1-1.73 1a2 2 0 110-4c.74 0 1.39.4 1.73 1H5a7 7 0 017-7V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/>
      <circle cx="12" cy="14" r="3"/>
    </svg>
  ),
  storage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/>
      <path d="M4 14a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z"/>
      <circle cx="7" cy="7" r="1" fill="currentColor"/>
      <circle cx="7" cy="15" r="1" fill="currentColor"/>
    </svg>
  ),
  metadata: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M7 7h10M7 12h10M7 17h6"/>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"/>
    </svg>
  ),
  appearance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3v18"/>
      <path d="M12 3a9 9 0 000 18" fill="currentColor" fillOpacity="0.15"/>
    </svg>
  ),
  export: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4"/>
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
    </svg>
  )
}

const SECTIONS = [
  { id: 'ai', label: 'AI & Models' },
  { id: 'storage', label: 'Storage' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'account', label: 'Account' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'export', label: 'Export & Privacy' }
]

export default function SettingsModal({ onClose }) {
  const [activeSection, setActiveSection] = useState('ai')
  const [settings, setSettings] = useState(null)
  const [localSettings, setLocalSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // AI state
  const [claudeKey, setClaudeKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [ollamaStatus, setOllamaStatus] = useState({ available: false, models: [] })
  const [testingOllama, setTestingOllama] = useState(false)
  const [testingClaude, setTestingClaude] = useState(false)
  const [testingOpenai, setTestingOpenai] = useState(false)

  // WebLLM state
  const [webllmSupported, setWebllmSupported] = useState(false)
  const [webllmReady, setWebllmReady] = useState(false)
  const [webllmDownloading, setWebllmDownloading] = useState(false)
  const [webllmProgress, setWebllmProgress] = useState(0)
  const [webllmProgressText, setWebllmProgressText] = useState('')
  const [selectedWebllmModel, setSelectedWebllmModel] = useState('Llama-3.2-3B-Instruct-q4f32_1-MLC')

  // Ollama model browser state
  const [showOllamaModelBrowser, setShowOllamaModelBrowser] = useState(false)
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('llama3.1:8b')
  const [ollamaPulling, setOllamaPulling] = useState(false)
  const [ollamaPullProgress, setOllamaPullProgress] = useState(0)
  const [ollamaPullText, setOllamaPullText] = useState('')

  // Account state
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Display settings state
  const [showTags, setShowTagsState] = useState(settingsService.getShowTags())
  const [showKeywords, setShowKeywordsState] = useState(settingsService.getShowKeywords())

  // Migration state
  const [showMigrationWizard, setShowMigrationWizard] = useState(false)
  const [migrationMode, setMigrationMode] = useState(null) // 'export' or 'import'

  const provider = useAIStore((s) => s.provider)
  const model = useAIStore((s) => s.model)
  const setProvider = useAIStore((s) => s.setProvider)
  const setModel = useAIStore((s) => s.setModel)
  const setAvailable = useAIStore((s) => s.setAvailable)
  const allDeviceSettings = useAIStore((s) => s.allDeviceSettings)
  const setDeviceProvider = useAIStore((s) => s.setDeviceProvider)

  // Current device info
  const currentDeviceType = getDeviceType()
  const currentDeviceName = getDeviceName(currentDeviceType)

  const adapter = useStorageStore((s) => s.adapter)
  const storageProvider = useStorageStore((s) => s.provider)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)
  const disconnect = useStorageStore((s) => s.disconnect)

  const setTheme = useUIStore((s) => s.setTheme)
  const currentTheme = useUIStore((s) => s.theme)
  const showDocCounts = useUIStore((s) => s.showDocCounts)
  const setShowDocCounts = useUIStore((s) => s.setShowDocCounts)
  const fontSize = useUIStore((s) => s.fontSize)
  const setFontSize = useUIStore((s) => s.setFontSize)
  const pdfDefaultZoom = useUIStore((s) => s.pdfDefaultZoom)
  const setPdfDefaultZoom = useUIStore((s) => s.setPdfDefaultZoom)
  const splitViewDefaultEnabled = useUIStore((s) => s.splitViewDefaultEnabled)
  const setSplitViewDefaultEnabled = useUIStore((s) => s.setSplitViewDefaultEnabled)
  const splitViewRatio = useUIStore((s) => s.splitViewRatio)
  const setSplitViewRatio = useUIStore((s) => s.setSplitViewRatio)
  const fullscreenOverlayWidth = useUIStore((s) => s.fullscreenOverlayWidth)
  const setFullscreenOverlayWidth = useUIStore((s) => s.setFullscreenOverlayWidth)

  const { showToast } = useToast()

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { remote, local } = await settingsService.load(isDemoMode ? null : adapter)
        setSettings(remote)
        setLocalSettings(local)

        // Load user profile
        setUserName(settingsService.getUserName())
        setUserEmail(settingsService.getUserEmail())

        // Sync export options to localStorage for ChatExporter
        if (remote?.global?.export) {
          const exportOptions = {
            includeCitations: remote.global.export.chat_include_citations ?? true,
            includeTimestamps: remote.global.export.chat_include_timestamps ?? false
          }
          localStorage.setItem('sv_chat_export_options', JSON.stringify(exportOptions))
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
        setSettings(settingsService.defaults())
        setLocalSettings({
          ai_provider: 'ollama',
          ai_model: 'llama3.2',
          claude_key_set: false,
          openai_key_set: false
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
    checkOllamaStatus()
    checkWebLLMStatus()
  }, [adapter, isDemoMode])

  const checkWebLLMStatus = () => {
    setWebllmSupported(webllmService.isSupported())
    setWebllmReady(webllmService.isReady())
  }

  const handleDownloadWebLLM = async () => {
    if (webllmDownloading) return

    setWebllmDownloading(true)
    setWebllmProgress(0)
    setWebllmProgressText('Starting download...')

    try {
      await webllmService.initialize(selectedWebllmModel, (progress) => {
        setWebllmProgress(progress.progress * 100)
        setWebllmProgressText(progress.text || `${Math.round(progress.progress * 100)}%`)
      })

      // Save the model so we can auto-initialize on next load
      localStorage.setItem('sv_webllm_model', selectedWebllmModel)

      setWebllmReady(true)
      setAvailable(true)
      showToast({ message: 'WebLLM model ready!', type: 'success' })
    } catch (error) {
      console.error('WebLLM download failed:', error)
      showToast({ message: error.message || 'Failed to download model', type: 'error' })
    } finally {
      setWebllmDownloading(false)
    }
  }

  const checkOllamaStatus = async () => {
    const available = await ollamaService.isAvailable()
    const models = available ? await ollamaService.getModels() : []
    setOllamaStatus({ available, models })
  }

  const handleTestOllama = async () => {
    setTestingOllama(true)
    try {
      const available = await ollamaService.isAvailable()
      if (available) {
        const models = await ollamaService.getModels()
        setOllamaStatus({ available: true, models })
        showToast({ message: `Ollama connected - ${models.length} model${models.length !== 1 ? 's' : ''} available`, type: 'success' })
      } else {
        setOllamaStatus({ available: false, models: [] })
        showToast({ message: 'Cannot reach Ollama - is it running?', type: 'error' })
      }
    } finally {
      setTestingOllama(false)
    }
  }

  const handlePullOllamaModel = async () => {
    if (ollamaPulling) return

    setOllamaPulling(true)
    setOllamaPullProgress(0)
    setOllamaPullText('Starting download...')

    try {
      await ollamaService.pullModel(selectedOllamaModel, (progress) => {
        setOllamaPullProgress(progress.progress)
        if (progress.status === 'pulling manifest') {
          setOllamaPullText('Fetching model info...')
        } else if (progress.status === 'downloading') {
          const completed = (progress.completed / (1024 * 1024 * 1024)).toFixed(2)
          const total = (progress.total / (1024 * 1024 * 1024)).toFixed(2)
          setOllamaPullText(`Downloading: ${completed} GB / ${total} GB`)
        } else if (progress.status === 'verifying sha256 digest') {
          setOllamaPullText('Verifying download...')
        } else if (progress.status === 'writing manifest') {
          setOllamaPullText('Finalizing...')
        } else if (progress.status === 'success') {
          setOllamaPullText('Complete!')
        } else {
          setOllamaPullText(progress.status || `${Math.round(progress.progress)}%`)
        }
      })

      // Refresh model list
      const models = await ollamaService.getModels()
      setOllamaStatus({ available: true, models })
      setShowOllamaModelBrowser(false)
      showToast({ message: `Model ${selectedOllamaModel} downloaded successfully!`, type: 'success' })
    } catch (error) {
      console.error('Ollama pull failed:', error)
      showToast({ message: error.message || 'Failed to download model', type: 'error' })
    } finally {
      setOllamaPulling(false)
    }
  }

  const handleTestClaude = async () => {
    if (!claudeKey) {
      showToast({ message: 'Enter an API key first', type: 'warning' })
      return
    }

    setTestingClaude(true)
    try {
      // Temporarily set the key to test
      claudeService.setApiKey(claudeKey)
      const response = await claudeService.chat([
        { role: 'user', content: 'Say "OK" and nothing else.' }
      ], 'claude-haiku-4-5-20251001')

      if (response) {
        showToast({ message: 'Claude API key is valid', type: 'success' })
        setLocalSettings(prev => ({ ...prev, claude_key_set: true }))
      }
    } catch (error) {
      claudeService.setApiKey('')
      showToast({ message: error.message || 'Invalid API key', type: 'error' })
    } finally {
      setTestingClaude(false)
    }
  }

  const handleTestOpenai = async () => {
    if (!openaiKey) {
      showToast({ message: 'Enter an API key first', type: 'warning' })
      return
    }

    setTestingOpenai(true)
    try {
      // Temporarily set the key to test
      openaiService.setApiKey(openaiKey)
      const response = await openaiService.chat([
        { role: 'user', content: 'Say "OK" and nothing else.' }
      ], 'gpt-4o-mini')

      if (response) {
        showToast({ message: 'OpenAI API key is valid', type: 'success' })
        setLocalSettings(prev => ({ ...prev, openai_key_set: true }))
      }
    } catch (error) {
      openaiService.setApiKey('')
      showToast({ message: error.message || 'Invalid API key', type: 'error' })
    } finally {
      setTestingOpenai(false)
    }
  }

  const handleProviderChange = (newProvider) => {
    setProvider(newProvider)
    settingsService.setAIProvider(newProvider)

    // Update availability
    if (newProvider === 'ollama') {
      setAvailable(ollamaStatus.available)
    } else if (newProvider === 'webllm') {
      setAvailable(webllmReady)
    } else if (newProvider === 'claude') {
      setAvailable(claudeService.isConfigured())
    } else if (newProvider === 'openai') {
      setAvailable(openaiService.isConfigured())
    } else if (newProvider === 'none') {
      setAvailable(false)
    }
  }

  const handleModelChange = (newModel) => {
    setModel(newModel)
    settingsService.setAIModel(newModel)
  }

  const updateGlobalSetting = (path, value) => {
    setSettings(prev => {
      const updated = { ...prev }
      const parts = path.split('.')
      let obj = updated.global
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]]
      }
      obj[parts[parts.length - 1]] = value
      return updated
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (!isDemoMode && adapter) {
        await settingsService.save(adapter, settings.global)
      }
      showToast({ message: 'Settings saved', type: 'success' })
      onClose()
    } catch (error) {
      console.error('Failed to save settings:', error)
      showToast({ message: 'Failed to save settings', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (confirm('This will sign you out. Your data remains in Box.')) {
      await disconnect()
      onClose()
    }
  }

  const handleClearChatHistory = async () => {
    if (confirm('Clear all AI chat history? This cannot be undone.')) {
      try {
        if (!isDemoMode && adapter) {
          await adapter.writeJSON('_system/chat_history.json', { version: '1.0', conversations: [] })
        }
        showToast({ message: 'Chat history cleared', type: 'success' })
      } catch (error) {
        showToast({ message: 'Failed to clear chat history', type: 'error' })
      }
    }
  }

  const handleReindexAll = async () => {
    if (isDemoMode || !adapter) {
      showToast({ message: 'Not available in demo mode', type: 'warning' })
      return
    }

    const documents = useLibraryStore.getState().documents
    const docIds = Object.keys(documents)

    if (docIds.length === 0) {
      showToast({ message: 'No documents to re-index', type: 'info' })
      return
    }

    if (!confirm(`Re-index all ${docIds.length} documents? This may take a while.`)) {
      return
    }

    showToast({ message: `Re-indexing ${docIds.length} documents...`, type: 'info' })

    let successCount = 0
    let failCount = 0

    for (const docId of docIds) {
      const doc = documents[docId]
      if (!doc.box_path) {
        failCount++
        continue
      }

      try {
        const pdfUrl = await adapter.getFileStreamURL(doc.box_path)
        await indexService.indexDocument(docId, pdfUrl, adapter)
        successCount++
      } catch (error) {
        console.error(`Failed to re-index ${docId}:`, error)
        failCount++
      }
    }

    if (failCount === 0) {
      showToast({ message: `Re-indexed ${successCount} documents`, type: 'success' })
    } else {
      showToast({ message: `Re-indexed ${successCount} documents, ${failCount} failed`, type: 'warning' })
    }
  }

  const handleCleanupOrphans = async () => {
    if (isDemoMode || !adapter) {
      showToast({ message: 'Not available in demo mode', type: 'warning' })
      return
    }

    const documents = useLibraryStore.getState().documents
    const removeDocument = useLibraryStore.getState().removeDocument
    const docIds = Object.keys(documents)

    if (docIds.length === 0) {
      showToast({ message: 'No documents to check', type: 'info' })
      return
    }

    showToast({ message: 'Checking for orphaned documents...', type: 'info' })

    const orphanedIds = []

    for (const docId of docIds) {
      const doc = documents[docId]
      if (!doc.box_path) {
        orphanedIds.push(docId)
        continue
      }

      try {
        // Try to check if file exists
        await adapter.getFileStreamURL(doc.box_path)
      } catch (error) {
        // File doesn't exist
        orphanedIds.push(docId)
      }
    }

    if (orphanedIds.length === 0) {
      showToast({ message: 'No orphaned documents found', type: 'success' })
      return
    }

    const orphanedNames = orphanedIds.map(id => {
      const doc = documents[id]
      return doc.metadata?.title || doc.filename || id
    }).join('\n- ')

    if (confirm(`Found ${orphanedIds.length} orphaned document(s) (files no longer exist):\n\n- ${orphanedNames}\n\nRemove these from your library?`)) {
      for (const docId of orphanedIds) {
        removeDocument(docId)
      }

      // Save to storage
      const { folders, documents: updatedDocs } = useLibraryStore.getState()
      await LibraryService.saveLibrary(adapter, { version: '1.0', folders, documents: updatedDocs })

      showToast({ message: `Removed ${orphanedIds.length} orphaned document(s)`, type: 'success' })
    }
  }

  if (isLoading) {
    return (
      <Modal onClose={onClose} width={800}>
        <div className={styles.loading}>Loading settings...</div>
      </Modal>
    )
  }

  const renderAISection = () => (
    <div className={styles.section}>
      {/* Per-device settings notice */}
      <div className={styles.deviceNotice}>
        <div className={styles.deviceHeader}>
          <span className={styles.deviceIcon}>
            {currentDeviceType === 'mobile' ? '📱' : currentDeviceType === 'tablet' ? '📱' : '💻'}
          </span>
          <span>You're on <strong>{currentDeviceName}</strong></span>
        </div>
        <p className={styles.deviceHint}>
          AI settings are saved per device. Configure different providers for desktop, tablet, and phone.
        </p>
      </div>

      {/* Per-device quick settings */}
      <div className={styles.deviceSettings}>
        {Object.values(DEVICE_TYPES).map(deviceType => {
          const settings = allDeviceSettings[deviceType] || { provider: 'none', model: '' }
          const deviceName = getDeviceName(deviceType)
          const isCurrent = deviceType === currentDeviceType
          const recommended = getRecommendedProviders(deviceType)

          return (
            <div
              key={deviceType}
              className={`${styles.deviceCard} ${isCurrent ? styles.currentDevice : ''}`}
            >
              <div className={styles.deviceCardHeader}>
                <span className={styles.deviceCardIcon}>
                  {deviceType === 'mobile' ? '📱' : deviceType === 'tablet' ? '📱' : '💻'}
                </span>
                <span className={styles.deviceCardName}>{deviceName}</span>
                {isCurrent && <span className={styles.currentBadge}>Current</span>}
              </div>
              <select
                className={styles.deviceSelect}
                value={settings.provider}
                onChange={(e) => {
                  const newProvider = e.target.value
                  // Get a default model for the provider
                  let defaultModel = ''
                  if (newProvider === 'ollama') defaultModel = 'llama3.2'
                  else if (newProvider === 'claude') defaultModel = 'claude-sonnet-4-20250514'
                  else if (newProvider === 'openai') defaultModel = 'gpt-4o-mini'
                  else if (newProvider === 'webllm') defaultModel = 'Llama-3.2-3B-Instruct-q4f32_1-MLC'

                  setDeviceProvider(deviceType, newProvider, defaultModel)

                  // If changing current device, also update availability
                  if (isCurrent) {
                    if (newProvider === 'ollama') setAvailable(ollamaStatus.available)
                    else if (newProvider === 'webllm') setAvailable(webllmReady)
                    else if (newProvider === 'claude') setAvailable(claudeService.isConfigured())
                    else if (newProvider === 'openai') setAvailable(openaiService.isConfigured())
                    else setAvailable(false)
                  }
                }}
              >
                {recommended.map(p => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={p.id === 'webllm' && deviceType !== 'desktop'}
                  >
                    {p.name}{p.id === 'webllm' && deviceType !== 'desktop' ? ' (desktop only)' : ''}
                  </option>
                ))}
              </select>
              <span className={styles.deviceProviderHint}>
                {recommended.find(p => p.id === settings.provider)?.reason || ''}
              </span>
            </div>
          )
        })}
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 24 }}>
        {currentDeviceName} Configuration
      </h3>

      <div className={styles.radioGroup}>
        <label className={styles.radioOption}>
          <input
            type="radio"
            name="provider"
            checked={provider === 'ollama'}
            onChange={() => handleProviderChange('ollama')}
          />
          <div className={styles.radioContent}>
            <span className={styles.radioLabel}>Ollama (Local)</span>
            <span className={styles.radioDesc}>Run AI locally on your machine</span>
          </div>
        </label>

        <label className={styles.radioOption}>
          <input
            type="radio"
            name="provider"
            checked={provider === 'webllm'}
            onChange={() => handleProviderChange('webllm')}
          />
          <div className={styles.radioContent}>
            <span className={styles.radioLabel}>WebLLM (Browser)</span>
            <span className={styles.radioDesc}>AI runs in browser via WebGPU</span>
          </div>
        </label>

        <label className={styles.radioOption}>
          <input
            type="radio"
            name="provider"
            checked={provider === 'claude'}
            onChange={() => handleProviderChange('claude')}
          />
          <div className={styles.radioContent}>
            <span className={styles.radioLabel}>Claude API</span>
            <span className={styles.radioDesc}>Anthropic's Claude models</span>
          </div>
        </label>

        <label className={styles.radioOption}>
          <input
            type="radio"
            name="provider"
            checked={provider === 'openai'}
            onChange={() => handleProviderChange('openai')}
          />
          <div className={styles.radioContent}>
            <span className={styles.radioLabel}>OpenAI API</span>
            <span className={styles.radioDesc}>GPT-4o and other OpenAI models</span>
          </div>
        </label>

        <label className={styles.radioOption}>
          <input
            type="radio"
            name="provider"
            checked={provider === 'none'}
            onChange={() => handleProviderChange('none')}
          />
          <div className={styles.radioContent}>
            <span className={styles.radioLabel}>None</span>
            <span className={styles.radioDesc}>Disable AI features</span>
          </div>
        </label>
      </div>

      {/* Ollama Config */}
      {provider === 'ollama' && (
        <div className={styles.providerConfig}>
          <div className={styles.statusRow}>
            <span className={`${styles.statusDot} ${ollamaStatus.available ? styles.available : ''}`} />
            <span>{ollamaStatus.available ? `Connected - ${ollamaStatus.models.length} model${ollamaStatus.models.length !== 1 ? 's' : ''}` : 'Not connected'}</span>
            <button
              className={styles.testBtn}
              onClick={handleTestOllama}
              disabled={testingOllama}
            >
              {testingOllama ? 'Testing...' : 'Test connection'}
            </button>
          </div>

          {ollamaStatus.available && ollamaStatus.models.length > 0 && (
            <div className={styles.field}>
              <label>Model</label>
              <select
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {ollamaStatus.models.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {ollamaStatus.available && (
            <>
              <button
                className={styles.toggleBrowserBtn}
                onClick={() => setShowOllamaModelBrowser(!showOllamaModelBrowser)}
                style={{ marginTop: 12 }}
              >
                {showOllamaModelBrowser ? 'Hide Model Browser' : 'Download New Model'}
              </button>

              {showOllamaModelBrowser && (
                <div className={styles.modelBrowser}>
                  <div className={styles.modelBrowserHeader}>
                    <strong>Download Model</strong>
                  </div>

                  <div className={styles.field}>
                    <label>Select Model</label>
                    <select
                      value={selectedOllamaModel}
                      onChange={(e) => setSelectedOllamaModel(e.target.value)}
                      disabled={ollamaPulling}
                    >
                      {ollamaService.getPopularModels().map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.size})
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const selectedModel = ollamaService.getPopularModels().find(m => m.id === selectedOllamaModel)
                    if (!selectedModel) return null
                    return (
                      <div className={styles.modelInfo}>
                        <div className={styles.modelInfoRow}>
                          <div className={styles.modelInfoItem}>
                            <span className={styles.modelInfoLabel}>Download Size</span>
                            <span className={styles.modelInfoValue}>{selectedModel.size}</span>
                          </div>
                          <div className={styles.modelInfoItem}>
                            <span className={styles.modelInfoLabel}>RAM Required</span>
                            <span className={styles.modelInfoValue}>{selectedModel.ram}</span>
                          </div>
                          <div className={styles.modelInfoItem}>
                            <span className={styles.modelInfoLabel}>Quality</span>
                            <span className={`${styles.qualityBadge} ${
                              selectedModel.quality === 'excellent' ? styles.qualityExcellent :
                              selectedModel.quality === 'good' ? styles.qualityGood :
                              styles.qualityBasic
                            }`}>
                              {selectedModel.quality}
                            </span>
                          </div>
                        </div>
                        <div className={styles.modelDescription}>
                          {selectedModel.description}
                        </div>
                      </div>
                    )
                  })()}

                  {!ollamaPulling && (
                    <button
                      className={styles.primaryBtn}
                      onClick={handlePullOllamaModel}
                      style={{ marginTop: 12 }}
                    >
                      Download Model
                    </button>
                  )}

                  {ollamaPulling && (
                    <div className={styles.progressContainer}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${ollamaPullProgress}%` }}
                        />
                      </div>
                      <span className={styles.progressText}>{ollamaPullText}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!ollamaStatus.available && (
            <>
              <div className={styles.hint}>
                <strong>Setup Instructions:</strong>
                <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                  <li>Download Ollama from <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a></li>
                  <li>Start with CORS enabled (see command below)</li>
                  <li>Click "Test connection" above</li>
                </ol>
              </div>

              <div className={styles.corsHint}>
                <strong>CORS Configuration Required</strong>
                <p>To allow ScholarLib to connect, start Ollama with:</p>
                <code>OLLAMA_ORIGINS="*" ollama serve</code>
                <p style={{ marginTop: 8 }}>
                  On macOS, you can set this permanently with:
                </p>
                <code>launchctl setenv OLLAMA_ORIGINS "*"</code>
              </div>
            </>
          )}
        </div>
      )}

      {/* WebLLM Config */}
      {provider === 'webllm' && (
        <div className={styles.providerConfig}>
          {!webllmSupported ? (
            <div className={styles.hint} style={{ color: 'var(--color-error)' }}>
              WebGPU is not supported in this browser.
              <br />
              Try Chrome 113+, Edge 113+, or Safari 18+.
            </div>
          ) : (
            <>
              <div className={styles.statusRow}>
                <span className={`${styles.statusDot} ${webllmReady ? styles.available : ''}`} />
                <span>{webllmReady ? 'Model loaded and ready' : 'Model not loaded'}</span>
              </div>

              {!webllmReady && !webllmDownloading && (
                <>
                  <div className={styles.field}>
                    <label>Model</label>
                    <select
                      value={selectedWebllmModel}
                      onChange={(e) => setSelectedWebllmModel(e.target.value)}
                    >
                      {webllmService.getAvailableModels().map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.size}) - {m.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    className={styles.primaryBtn}
                    onClick={handleDownloadWebLLM}
                    style={{ marginTop: 12 }}
                  >
                    Download Model
                  </button>

                  <div className={styles.hint}>
                    Model will be downloaded once and cached in your browser.
                    <br />
                    Requires ~{webllmService.getAvailableModels().find(m => m.id === selectedWebllmModel)?.size || '2GB'} of storage.
                  </div>
                </>
              )}

              {webllmDownloading && (
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${webllmProgress}%` }}
                    />
                  </div>
                  <span className={styles.progressText}>{webllmProgressText}</span>
                </div>
              )}

              {webllmReady && (
                <div className={styles.hint} style={{ color: 'var(--color-success)' }}>
                  WebLLM is ready! AI features will run entirely in your browser.
                  <br />
                  No data is sent to external servers.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Claude Config */}
      {provider === 'claude' && (
        <div className={styles.providerConfig}>
          <div className={styles.field}>
            <label>API Key</label>
            <div className={styles.inputRow}>
              <input
                type="password"
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                placeholder={localSettings?.claude_key_set ? '••••••••••••••••' : 'sk-ant-...'}
              />
              <button
                className={styles.testBtn}
                onClick={handleTestClaude}
                disabled={testingClaude || !claudeKey}
              >
                {testingClaude ? 'Testing...' : 'Test key'}
              </button>
            </div>
            <span className={styles.fieldHint}>
              Stored locally on this device only. Never sent to any server.
            </span>
          </div>

          <div className={styles.field}>
            <label>Model</label>
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {claudeService.getAvailableModels().map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} - {m.inputPrice} input
                </option>
              ))}
            </select>
          </div>

          <div className={styles.costWarning}>
            Cloud API usage incurs costs. Check Anthropic's pricing.
          </div>
        </div>
      )}

      {/* OpenAI Config */}
      {provider === 'openai' && (
        <div className={styles.providerConfig}>
          <div className={styles.field}>
            <label>API Key</label>
            <div className={styles.inputRow}>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={localSettings?.openai_key_set ? '••••••••••••••••' : 'sk-...'}
              />
              <button
                className={styles.testBtn}
                onClick={handleTestOpenai}
                disabled={testingOpenai || !openaiKey}
              >
                {testingOpenai ? 'Testing...' : 'Test key'}
              </button>
            </div>
            <span className={styles.fieldHint}>
              Stored locally on this device only. Never sent to any server.
            </span>
          </div>

          <div className={styles.field}>
            <label>Model</label>
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              {openaiService.getAvailableModels().map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} - {m.inputPrice} input
                </option>
              ))}
            </select>
          </div>

          <div className={styles.costWarning}>
            Cloud API usage incurs costs. Check OpenAI's pricing.
          </div>
        </div>
      )}
    </div>
  )

  const handleOpenExport = () => {
    setMigrationMode('export')
    setShowMigrationWizard(true)
  }

  const handleOpenImport = () => {
    setMigrationMode('import')
    setShowMigrationWizard(true)
  }

  const handleMigrationClose = () => {
    setShowMigrationWizard(false)
    setMigrationMode(null)
  }

  const handleMigrationComplete = () => {
    // Reload library data after import
    window.location.reload()
  }

  const renderStorageSection = () => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Storage Provider</h3>

      <div className={styles.storageInfo}>
        <div className={styles.storageRow}>
          <span className={styles.storageLabel}>Provider</span>
          <span className={styles.storageValue}>
            {isDemoMode ? 'Demo Mode' : storageProvider === 'box' ? 'Box' : 'Dropbox'}
          </span>
        </div>

        {!isDemoMode && (
          <div className={styles.storageRow}>
            <span className={styles.storageLabel}>Status</span>
            <span className={styles.storageValue}>
              <span className={`${styles.statusDot} ${styles.available}`} />
              Connected
            </span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.dangerBtn}
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>

      {!isDemoMode && (
        <p className={styles.hint}>
          Disconnecting will sign you out. Your PDFs and library data remain safely in {storageProvider === 'box' ? 'Box' : 'Dropbox'}.
        </p>
      )}

      {!isDemoMode && (
        <>
          <h3 className={styles.sectionTitle} style={{ marginTop: 32 }}>Migration</h3>
          <p className={styles.hint}>
            Moving to a different storage provider? Export your library data and import it after connecting to the new provider.
          </p>

          <div className={styles.actions} style={{ marginTop: 12 }}>
            <button
              className={styles.secondaryBtn}
              onClick={handleOpenExport}
            >
              Export Library Bundle
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={handleOpenImport}
            >
              Import Library Bundle
            </button>
          </div>
        </>
      )}
    </div>
  )

  const renderMetadataSection = () => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Metadata Extraction</h3>

      <div className={styles.field}>
        <label>Extraction Mode</label>
        <div className={styles.radioGroup}>
          <label className={styles.radioOption}>
            <input
              type="radio"
              name="extractionMode"
              checked={settings?.global?.metadata_extraction_mode === 'auto'}
              onChange={() => updateGlobalSetting('metadata_extraction_mode', 'auto')}
            />
            <div className={styles.radioContent}>
              <span className={styles.radioLabel}>Auto</span>
              <span className={styles.radioDesc}>Extract and apply automatically</span>
            </div>
          </label>

          <label className={styles.radioOption}>
            <input
              type="radio"
              name="extractionMode"
              checked={settings?.global?.metadata_extraction_mode === 'review'}
              onChange={() => updateGlobalSetting('metadata_extraction_mode', 'review')}
            />
            <div className={styles.radioContent}>
              <span className={styles.radioLabel}>Review</span>
              <span className={styles.radioDesc}>Show extracted data for review before saving</span>
            </div>
          </label>

          <label className={styles.radioOption}>
            <input
              type="radio"
              name="extractionMode"
              checked={settings?.global?.metadata_extraction_mode === 'manual'}
              onChange={() => updateGlobalSetting('metadata_extraction_mode', 'manual')}
            />
            <div className={styles.radioContent}>
              <span className={styles.radioLabel}>Manual</span>
              <span className={styles.radioDesc}>Don't auto-extract, enter manually</span>
            </div>
          </label>
        </div>
      </div>

      <div className={styles.field}>
        <label>Extraction Sources</label>
        <div className={styles.toggleGroup}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.metadata_sources?.pdf_embedded ?? true}
              onChange={(e) => updateGlobalSetting('metadata_sources.pdf_embedded', e.target.checked)}
            />
            <span>PDF Embedded Metadata</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.metadata_sources?.grobid ?? true}
              onChange={(e) => updateGlobalSetting('metadata_sources.grobid', e.target.checked)}
            />
            <span>GROBID (ML-based, 90%+ accuracy)</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.metadata_sources?.openalex ?? true}
              onChange={(e) => updateGlobalSetting('metadata_sources.openalex', e.target.checked)}
            />
            <span>OpenAlex (citations, open access links)</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.metadata_sources?.crossref ?? true}
              onChange={(e) => updateGlobalSetting('metadata_sources.crossref', e.target.checked)}
            />
            <span>CrossRef API</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.metadata_sources?.semantic_scholar ?? true}
              onChange={(e) => updateGlobalSetting('metadata_sources.semantic_scholar', e.target.checked)}
            />
            <span>Semantic Scholar API</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.metadata_sources?.ai ?? true}
              onChange={(e) => updateGlobalSetting('metadata_sources.ai', e.target.checked)}
            />
            <span>AI Extraction (fallback)</span>
          </label>
        </div>
      </div>

      {settings?.global?.metadata_sources?.grobid && (
        <div className={styles.field}>
          <label>GROBID Endpoint</label>
          <select
            value={settings?.global?.grobid_endpoint || 'huggingface'}
            onChange={(e) => updateGlobalSetting('grobid_endpoint', e.target.value)}
          >
            <option value="huggingface">HuggingFace (recommended)</option>
            <option value="scienceminer">ScienceMiner (backup)</option>
          </select>
          <span className={styles.fieldHint}>
            GROBID sends full PDF to external server for ML-based extraction
          </span>
        </div>
      )}

      <div className={styles.field}>
        <label>CrossRef Email</label>
        <input
          type="email"
          value={settings?.global?.crossref_email || ''}
          onChange={(e) => updateGlobalSetting('crossref_email', e.target.value)}
          placeholder="your@email.com"
        />
        <span className={styles.fieldHint}>
          Adding your email improves CrossRef API rate limits
        </span>
      </div>
    </div>
  )

  const handleSaveProfile = () => {
    settingsService.setUserName(userName)
    settingsService.setUserEmail(userEmail)
    showToast({ message: 'Profile saved', type: 'success' })
  }

  const renderAccountSection = () => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Profile</h3>

      <div className={styles.field}>
        <label>Name</label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Enter your name"
        />
        <span className={styles.fieldHint}>Your name will be used in the sidebar and for AI chat initials.</span>
      </div>

      <div className={styles.field}>
        <label>Email</label>
        <input
          type="email"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          placeholder="Enter your email"
        />
        <span className={styles.fieldHint}>Used for sharing and collaboration features.</span>
      </div>

      <button className={styles.primaryBtn} onClick={handleSaveProfile}>
        Save Profile
      </button>

      <h3 className={styles.sectionTitle} style={{ marginTop: 32 }}>Device</h3>

      <div className={styles.storageInfo}>
        <div className={styles.storageRow}>
          <span className={styles.storageLabel}>Device Type</span>
          <span className={styles.storageValue}>{settingsService.getDeviceName()}</span>
        </div>
        <div className={styles.storageRow}>
          <span className={styles.storageLabel}>Device ID</span>
          <span className={styles.storageValue} style={{ fontFamily: 'monospace', fontSize: 11 }}>
            {settingsService.getDeviceId().slice(0, 8)}...
          </span>
        </div>
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 32 }}>Sharing</h3>
      <p className={styles.hint}>
        Share folders with collaborators using their email address. They will receive view or edit access to selected folders.
      </p>
    </div>
  )

  const renderAppearanceSection = () => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Appearance</h3>

      <div className={styles.field}>
        <label>Theme</label>
        <select
          value={currentTheme}
          onChange={(e) => {
            const newTheme = e.target.value
            setTheme(newTheme)
            updateGlobalSetting('appearance.theme', newTheme)
          }}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showDocCounts}
            onChange={(e) => {
              setShowDocCounts(e.target.checked)
              updateGlobalSetting('appearance.show_doc_counts', e.target.checked)
            }}
          />
          <span>Show document counts in sidebar</span>
        </label>
      </div>

      <div className={styles.field}>
        <label>Font Size</label>
        <select
          value={fontSize}
          onChange={(e) => {
            setFontSize(e.target.value)
            updateGlobalSetting('appearance.font_size', e.target.value)
          }}
        >
          <option value="normal">Normal</option>
          <option value="large">Large</option>
        </select>
      </div>

      <div className={styles.field}>
        <label>PDF Default Zoom</label>
        <select
          value={pdfDefaultZoom}
          onChange={(e) => {
            const zoom = parseInt(e.target.value)
            setPdfDefaultZoom(zoom)
            updateGlobalSetting('appearance.pdf_default_zoom', zoom)
          }}
        >
          <option value={75}>75%</option>
          <option value={100}>100%</option>
          <option value={125}>125%</option>
          <option value={150}>150%</option>
        </select>
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 24 }}>Split View</h3>

      <div className={styles.field}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={splitViewDefaultEnabled}
            onChange={(e) => {
              setSplitViewDefaultEnabled(e.target.checked)
              updateGlobalSetting('appearance.split_view_default', e.target.checked)
            }}
          />
          <span>Enable split view by default</span>
        </label>
        <span className={styles.fieldHint}>
          Split view shows PDF and Notes/AI Chat side by side
        </span>
      </div>

      <div className={styles.field}>
        <label>Default Split Ratio</label>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>PDF {Math.round(splitViewRatio * 100)}%</span>
          <input
            type="range"
            min="40"
            max="85"
            value={splitViewRatio * 100}
            onChange={(e) => {
              const ratio = parseInt(e.target.value) / 100
              setSplitViewRatio(ratio)
              updateGlobalSetting('appearance.split_view_ratio', ratio)
            }}
            className={styles.slider}
          />
          <span className={styles.sliderLabel}>Panel {Math.round((1 - splitViewRatio) * 100)}%</span>
        </div>
      </div>

      <div className={styles.field}>
        <label>Fullscreen Overlay Width</label>
        <div className={styles.sliderRow}>
          <span className={styles.sliderLabel}>{fullscreenOverlayWidth}px</span>
          <input
            type="range"
            min="250"
            max="500"
            value={fullscreenOverlayWidth}
            onChange={(e) => {
              const width = parseInt(e.target.value)
              setFullscreenOverlayWidth(width)
              updateGlobalSetting('appearance.fullscreen_overlay_width', width)
            }}
            className={styles.slider}
          />
        </div>
        <span className={styles.fieldHint}>
          Width of Notes/AI panel when PDF is in fullscreen mode
        </span>
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 24 }}>Document Cards</h3>

      <div className={styles.field}>
        <label>Display on document cards</label>
        <div className={styles.toggleGroup}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showTags}
              onChange={(e) => {
                setShowTagsState(e.target.checked)
                settingsService.setShowTags(e.target.checked)
              }}
            />
            <span>Tags (user-assigned organizational labels)</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showKeywords}
              onChange={(e) => {
                setShowKeywordsState(e.target.checked)
                settingsService.setShowKeywords(e.target.checked)
              }}
            />
            <span>Keywords (from paper metadata)</span>
          </label>
        </div>
        <span className={styles.fieldHint}>
          Tags are your organizational labels. Keywords are extracted from the paper's metadata.
        </span>
      </div>
    </div>
  )

  const renderExportSection = () => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Export</h3>

      <div className={styles.field}>
        <label>Default Export Format</label>
        <select
          value={settings?.global?.export?.default_format || 'markdown'}
          onChange={(e) => updateGlobalSetting('export.default_format', e.target.value)}
        >
          <option value="markdown">Markdown</option>
          <option value="txt">Plain Text</option>
          <option value="pdf">PDF</option>
          <option value="docx">Word (DOCX)</option>
        </select>
      </div>

      <div className={styles.field}>
        <label>Chat Export Options</label>
        <div className={styles.toggleGroup}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.export?.chat_include_citations ?? true}
              onChange={(e) => {
                updateGlobalSetting('export.chat_include_citations', e.target.checked)
                // Also save to localStorage for ChatExporter to read
                const options = JSON.parse(localStorage.getItem('sv_chat_export_options') || '{}')
                options.includeCitations = e.target.checked
                localStorage.setItem('sv_chat_export_options', JSON.stringify(options))
              }}
            />
            <span>Include citations</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.export?.chat_include_timestamps ?? false}
              onChange={(e) => {
                updateGlobalSetting('export.chat_include_timestamps', e.target.checked)
                // Also save to localStorage for ChatExporter to read
                const options = JSON.parse(localStorage.getItem('sv_chat_export_options') || '{}')
                options.includeTimestamps = e.target.checked
                localStorage.setItem('sv_chat_export_options', JSON.stringify(options))
              }}
            />
            <span>Include timestamps</span>
          </label>
        </div>
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 24 }}>Privacy</h3>

      <div className={styles.privacyNote}>
        <p><strong>Your data is private:</strong></p>
        <ul>
          <li>PDFs are stored only in your Box/Dropbox</li>
          <li>API keys are stored only on this device</li>
          <li>No data is sent to ScholarLib servers</li>
          <li>AI processing uses your chosen provider</li>
        </ul>
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 24 }}>Data Management</h3>

      <div className={styles.actions}>
        <button
          className={styles.dangerBtn}
          onClick={handleClearChatHistory}
        >
          Clear all AI chat history
        </button>

        <button
          className={styles.secondaryBtn}
          onClick={handleReindexAll}
        >
          Re-index all documents
        </button>

        <button
          className={styles.secondaryBtn}
          onClick={handleCleanupOrphans}
        >
          Remove orphaned documents
        </button>
      </div>

      <p className={styles.hint} style={{ marginTop: 8 }}>
        Orphaned documents are library entries whose PDF files no longer exist in storage.
      </p>
    </div>
  )

  const renderSection = () => {
    switch (activeSection) {
      case 'ai': return renderAISection()
      case 'storage': return renderStorageSection()
      case 'metadata': return renderMetadataSection()
      case 'account': return renderAccountSection()
      case 'appearance': return renderAppearanceSection()
      case 'export': return renderExportSection()
      default: return null
    }
  }

  return (
    <>
      <Modal onClose={onClose} width={800}>
        <div className={styles.container}>
          {/* Header */}
          <div className={styles.header}>
            <h2 className={styles.title}>Settings</h2>
            <button className={styles.closeBtn} onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className={styles.content}>
            {/* Nav */}
            <nav className={styles.nav}>
              {SECTIONS.map(section => (
                <button
                  key={section.id}
                  className={`${styles.navItem} ${activeSection === section.id ? styles.active : ''}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span className={styles.navIcon}>{SectionIcons[section.id]}</span>
                  <span className={styles.navLabel}>{section.label}</span>
                </button>
              ))}
            </nav>

            {/* Section content */}
            <div className={styles.sectionContent}>
              {renderSection()}
            </div>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <button className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {showMigrationWizard && (
        <MigrationWizard
          mode={migrationMode}
          adapter={adapter}
          provider={storageProvider}
          onClose={handleMigrationClose}
          onComplete={handleMigrationComplete}
        />
      )}
    </>
  )
}
