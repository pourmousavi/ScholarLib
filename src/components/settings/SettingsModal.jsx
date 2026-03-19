import { useState, useEffect } from 'react'
import { useAIStore } from '../../store/aiStore'
import { useStorageStore } from '../../store/storageStore'
import { useIndexStore } from '../../store/indexStore'
import { settingsService } from '../../services/settings/SettingsService'
import { ollamaService } from '../../services/ai/OllamaService'
import { claudeService } from '../../services/ai/ClaudeService'
import { openaiService } from '../../services/ai/OpenAIService'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import styles from './SettingsModal.module.css'

const SECTIONS = [
  { id: 'ai', label: 'AI & Models', icon: '~' },
  { id: 'storage', label: 'Storage', icon: '@' },
  { id: 'metadata', label: 'Metadata', icon: '#' },
  { id: 'account', label: 'Account', icon: '*' },
  { id: 'appearance', label: 'Appearance', icon: '&' },
  { id: 'export', label: 'Export & Privacy', icon: '%' }
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

  const provider = useAIStore((s) => s.provider)
  const model = useAIStore((s) => s.model)
  const setProvider = useAIStore((s) => s.setProvider)
  const setModel = useAIStore((s) => s.setModel)
  const setAvailable = useAIStore((s) => s.setAvailable)

  const adapter = useStorageStore((s) => s.adapter)
  const storageProvider = useStorageStore((s) => s.provider)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)
  const disconnect = useStorageStore((s) => s.disconnect)

  const { showToast } = useToast()

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { remote, local } = await settingsService.load(isDemoMode ? null : adapter)
        setSettings(remote)
        setLocalSettings(local)
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
  }, [adapter, isDemoMode])

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

  const handleReindexAll = () => {
    if (confirm('Re-index all documents? This may take a while.')) {
      showToast({ message: 'Re-indexing started (not yet implemented)', type: 'info' })
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
      <h3 className={styles.sectionTitle}>AI Provider</h3>

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
            <span>{ollamaStatus.available ? `Connected - ${ollamaStatus.models.length} models` : 'Not connected'}</span>
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

          {!ollamaStatus.available && (
            <div className={styles.hint}>
              Start Ollama with: <code>ollama serve</code>
              <br />
              Then run: <code>ollama pull llama3.2</code>
              <br />
              <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">
                Download Ollama
              </a>
            </div>
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
            <span>AI Extraction</span>
          </label>
        </div>
      </div>

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

  const renderAccountSection = () => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Account</h3>

      <div className={styles.storageInfo}>
        <div className={styles.storageRow}>
          <span className={styles.storageLabel}>Device</span>
          <span className={styles.storageValue}>{settingsService.getDeviceName()}</span>
        </div>
        <div className={styles.storageRow}>
          <span className={styles.storageLabel}>Device ID</span>
          <span className={styles.storageValue} style={{ fontFamily: 'monospace', fontSize: 11 }}>
            {settingsService.getDeviceId().slice(0, 8)}...
          </span>
        </div>
      </div>

      <h3 className={styles.sectionTitle} style={{ marginTop: 24 }}>Sharing</h3>
      <p className={styles.hint}>
        Sharing features will be available in a future update.
      </p>
    </div>
  )

  const renderAppearanceSection = () => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Appearance</h3>

      <div className={styles.field}>
        <label>Theme</label>
        <select
          value={settings?.global?.appearance?.theme || 'dark'}
          onChange={(e) => updateGlobalSetting('appearance.theme', e.target.value)}
        >
          <option value="dark">Dark</option>
          <option value="light">Light (Coming soon)</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings?.global?.appearance?.show_doc_counts ?? true}
            onChange={(e) => updateGlobalSetting('appearance.show_doc_counts', e.target.checked)}
          />
          <span>Show document counts in sidebar</span>
        </label>
      </div>

      <div className={styles.field}>
        <label>Font Size</label>
        <select
          value={settings?.global?.appearance?.font_size || 'normal'}
          onChange={(e) => updateGlobalSetting('appearance.font_size', e.target.value)}
        >
          <option value="normal">Normal</option>
          <option value="large">Large</option>
        </select>
      </div>

      <div className={styles.field}>
        <label>PDF Default Zoom</label>
        <select
          value={settings?.global?.appearance?.pdf_default_zoom || 100}
          onChange={(e) => updateGlobalSetting('appearance.pdf_default_zoom', parseInt(e.target.value))}
        >
          <option value={75}>75%</option>
          <option value={100}>100%</option>
          <option value={125}>125%</option>
          <option value={150}>150%</option>
        </select>
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
              onChange={(e) => updateGlobalSetting('export.chat_include_citations', e.target.checked)}
            />
            <span>Include citations</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings?.global?.export?.chat_include_timestamps ?? false}
              onChange={(e) => updateGlobalSetting('export.chat_include_timestamps', e.target.checked)}
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
      </div>
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
    <Modal onClose={onClose} width={800}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>x</button>
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
                <span className={styles.navIcon}>{section.icon}</span>
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
  )
}
