/**
 * SettingsService - Manages app settings
 *
 * Global settings stored in Box (_system/settings.json)
 * Device-specific settings stored in localStorage
 */
class SettingsService {
  _mergeDefaults(settings) {
    const defaults = this.defaults()
    return {
      ...defaults,
      ...settings,
      global: {
        ...defaults.global,
        ...(settings?.global || {}),
        metadata_sources: {
          ...defaults.global.metadata_sources,
          ...(settings?.global?.metadata_sources || {})
        },
        appearance: {
          ...defaults.global.appearance,
          ...(settings?.global?.appearance || {})
        },
        doc_card: {
          ...defaults.global.doc_card,
          ...(settings?.global?.doc_card || {})
        },
        export: {
          ...defaults.global.export,
          ...(settings?.global?.export || {})
        },
        wiki: {
          ...defaults.global.wiki,
          ...(settings?.global?.wiki || {})
        }
      },
      devices: {
        ...defaults.devices,
        ...(settings?.devices || {})
      }
    }
  }

  /**
   * Default settings structure
   */
  defaults() {
    return {
      version: '1.0',
      global: {
        metadata_extraction_mode: 'auto', // auto | review | manual
        metadata_sources: {
          pdf_embedded: true,
          grobid: true,           // ML-based extraction, 90%+ accuracy
          openalex: true,         // Adds citations, open access links
          crossref: true,
          semantic_scholar: true,
          ai: true
        },
        grobid_endpoint: 'huggingface', // 'huggingface' or 'scienceminer'
        crossref_email: '',
        embedding_provider: 'browser', // browser | ollama | gemini | openai
        user_name: '',
        user_email: '',
        appearance: {
          theme: 'dark', // dark | light
          show_doc_counts: true,
          font_size: 'normal', // normal | large
          pdf_default_zoom: 100
        },
        doc_card: {
          show_tags: true,
          show_keywords: true,
          show_collections: true
        },
        export: {
          default_format: 'markdown',
          chat_include_citations: true,
          chat_include_timestamps: false
        },
        wiki: {
          enabled: false
        }
      },
      devices: {}
    }
  }

  /**
   * Load settings from Box and localStorage
   * @param {object} adapter - Storage adapter
   * @returns {Promise<object>}
   */
  async load(adapter) {
    let remote = this.defaults()

    if (adapter) {
      try {
        remote = this._mergeDefaults(await adapter.readJSON('_system/settings.json'))
      } catch {
        // Use defaults if file doesn't exist
      }
    }

    const deviceId = this.getDeviceId()

    // Read from per-device settings (primary), fallback to legacy keys
    const deviceSettings = this._getCurrentDeviceSettings()
    const local = {
      ai_provider: deviceSettings.provider,
      ai_model: deviceSettings.model,
      claude_key_set: !!localStorage.getItem('sv_claude_key'),
      openai_key_set: !!localStorage.getItem('sv_openai_key'),
      wiki_enabled: remote.global?.wiki?.enabled === true
    }
    localStorage.setItem('sv_wiki_enabled', String(local.wiki_enabled))

    return { remote, local, deviceId }
  }

  /**
   * Save global settings to Box
   * @param {object} adapter - Storage adapter
   * @param {object} globalSettings - Settings to save
   */
  async save(adapter, globalSettings) {
    if (!adapter) return

    let existing = this.defaults()
    try {
      existing = this._mergeDefaults(await adapter.readJSON('_system/settings.json'))
    } catch {
      // Use defaults if file doesn't exist
    }

    // Merge global settings
    existing.global = { ...existing.global, ...globalSettings }

    // Always sync cross-platform settings from localStorage into global
    const embProv = localStorage.getItem('sv_embedding_provider')
    if (embProv) existing.global.embedding_provider = embProv

    const userName = localStorage.getItem('sv_user_name')
    if (userName !== null) existing.global.user_name = userName

    const userEmail = localStorage.getItem('sv_user_email')
    if (userEmail !== null) existing.global.user_email = userEmail

    // Sync doc card display prefs
    const showTags = localStorage.getItem('sv_show_tags')
    if (showTags !== null) existing.global.doc_card = { ...existing.global.doc_card, show_tags: showTags === 'true' }

    const showKeywords = localStorage.getItem('sv_show_keywords')
    if (showKeywords !== null) existing.global.doc_card = { ...existing.global.doc_card, show_keywords: showKeywords === 'true' }

    const showCollections = localStorage.getItem('sv_show_collections')
    if (showCollections !== null) existing.global.doc_card = { ...existing.global.doc_card, show_collections: showCollections === 'true' }

    // Update device record
    const currentDevice = this._getCurrentDeviceSettings()
    existing.devices[this.getDeviceId()] = {
      device_name: this.getDeviceName(),
      last_seen: new Date().toISOString(),
      ai_provider: currentDevice.provider,
      ai_model: currentDevice.model
    }

    await adapter.writeJSON('_system/settings.json', existing)
    localStorage.setItem('sv_wiki_enabled', String(existing.global?.wiki?.enabled === true))
  }

  /**
   * Get unique device ID (generated on first use)
   * @returns {string}
   */
  getDeviceId() {
    let id = localStorage.getItem('sv_device_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('sv_device_id', id)
    }
    return id
  }

  /**
   * Get device name from user agent
   * @returns {string}
   */
  getDeviceName() {
    const ua = navigator.userAgent
    if (/iPad/.test(ua)) return 'iPad'
    if (/iPhone/.test(ua)) return 'iPhone'
    if (/Mac/.test(ua)) return 'Mac'
    if (/Windows/.test(ua)) return 'Windows'
    if (/Linux/.test(ua)) return 'Linux'
    return 'Browser'
  }

  /**
   * Get current device's AI settings from per-device storage
   * @returns {{ provider: string, model: string }}
   */
  _getCurrentDeviceSettings() {
    const saved = localStorage.getItem('sv_ai_device_settings')
    if (saved) {
      try {
        const settings = JSON.parse(saved)
        const deviceType = this._getDeviceType()
        if (settings[deviceType]) {
          return settings[deviceType]
        }
      } catch { /* fall through */ }
    }
    // Fallback to legacy keys
    return {
      provider: localStorage.getItem('sv_ai_provider') || 'ollama',
      model: localStorage.getItem('sv_ai_model') || 'llama3.2'
    }
  }

  /**
   * Simple device type detection matching aiStore logic
   */
  _getDeviceType() {
    const ua = navigator.userAgent.toLowerCase()
    const width = window.innerWidth
    const isMobileUA = /iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)
    const isTabletUA = /ipad|android(?!.*mobile)|tablet/i.test(ua)
    if (isMobileUA || (width < 640 && 'ontouchstart' in window)) return 'mobile'
    if (isTabletUA || (width >= 640 && width < 1024 && 'ontouchstart' in window)) return 'tablet'
    return 'desktop'
  }

  /**
   * Save AI provider to localStorage (both per-device and legacy)
   * @param {string} provider
   */
  setAIProvider(provider) {
    // Write to legacy key for backwards compat
    localStorage.setItem('sv_ai_provider', provider)
    // Also update per-device settings
    this._updateDeviceSetting('provider', provider)
  }

  /**
   * Save AI model to localStorage (both per-device and legacy)
   * @param {string} model
   */
  setAIModel(model) {
    localStorage.setItem('sv_ai_model', model)
    this._updateDeviceSetting('model', model)
  }

  /**
   * Update a single field in the current device's per-device settings
   */
  _updateDeviceSetting(field, value) {
    const deviceType = this._getDeviceType()
    let settings = {}
    const saved = localStorage.getItem('sv_ai_device_settings')
    if (saved) {
      try { settings = JSON.parse(saved) } catch { settings = {} }
    }
    if (!settings[deviceType]) {
      settings[deviceType] = { provider: 'ollama', model: 'llama3.2' }
    }
    settings[deviceType][field] = value
    localStorage.setItem('sv_ai_device_settings', JSON.stringify(settings))
  }

  /**
   * Get AI provider from localStorage
   * @returns {string}
   */
  getAIProvider() {
    return this._getCurrentDeviceSettings().provider
  }

  /**
   * Get AI model from localStorage
   * @returns {string}
   */
  getAIModel() {
    return this._getCurrentDeviceSettings().model
  }

  /**
   * Get user name from localStorage
   * @returns {string}
   */
  getUserName() {
    return localStorage.getItem('sv_user_name') || ''
  }

  /**
   * Set user name in localStorage
   * @param {string} name
   */
  setUserName(name) {
    localStorage.setItem('sv_user_name', name)
  }

  /**
   * Get user email from localStorage
   * @returns {string}
   */
  getUserEmail() {
    return localStorage.getItem('sv_user_email') || ''
  }

  /**
   * Set user email in localStorage
   * @param {string} email
   */
  setUserEmail(email) {
    localStorage.setItem('sv_user_email', email)
  }

  /**
   * Get user initials (for avatar)
   * @returns {string}
   */
  getUserInitials() {
    const name = this.getUserName()
    if (!name) return 'U'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name[0].toUpperCase()
  }

  /**
   * Apply cross-platform settings from Box to localStorage and stores.
   * Called once at app startup after library loads.
   * @param {object} adapter - Storage adapter
   * @param {{ setEmbeddingProvider: Function }} aiStore - AI store actions
   */
  async syncFromRemote(adapter, { setEmbeddingProvider } = {}) {
    if (!adapter) return

    let remote
    try {
      remote = this._mergeDefaults(await adapter.readJSON('_system/settings.json'))
    } catch {
      return // No remote settings yet
    }

    const g = remote.global
    if (!g) return

    // Embedding provider
    if (g.embedding_provider && setEmbeddingProvider) {
      setEmbeddingProvider(g.embedding_provider)
    }

    // User profile
    if (g.user_name !== undefined) localStorage.setItem('sv_user_name', g.user_name)
    if (g.user_email !== undefined) localStorage.setItem('sv_user_email', g.user_email)

    // Doc card display prefs
    if (g.doc_card) {
      if (g.doc_card.show_tags !== undefined) localStorage.setItem('sv_show_tags', String(g.doc_card.show_tags))
      if (g.doc_card.show_keywords !== undefined) localStorage.setItem('sv_show_keywords', String(g.doc_card.show_keywords))
      if (g.doc_card.show_collections !== undefined) localStorage.setItem('sv_show_collections', String(g.doc_card.show_collections))
    }

    // Export options
    if (g.export) {
      const exportOptions = {
        includeCitations: g.export.chat_include_citations ?? true,
        includeTimestamps: g.export.chat_include_timestamps ?? false
      }
      localStorage.setItem('sv_chat_export_options', JSON.stringify(exportOptions))
    }

    if (g.wiki?.enabled !== undefined) {
      localStorage.setItem('sv_wiki_enabled', String(g.wiki.enabled === true))
    }
  }

  // ============================================
  // Document Card Display Settings
  // ============================================

  /**
   * Get whether to show tags on document cards
   * @returns {boolean}
   */
  getShowTags() {
    const val = localStorage.getItem('sv_show_tags')
    return val === null ? true : val === 'true'
  }

  /**
   * Set whether to show tags on document cards
   * @param {boolean} show
   */
  setShowTags(show) {
    localStorage.setItem('sv_show_tags', show.toString())
  }

  /**
   * Get whether to show keywords on document cards
   * @returns {boolean}
   */
  getShowKeywords() {
    const val = localStorage.getItem('sv_show_keywords')
    return val === null ? true : val === 'true'
  }

  /**
   * Set whether to show keywords on document cards
   * @param {boolean} show
   */
  setShowKeywords(show) {
    localStorage.setItem('sv_show_keywords', show.toString())
  }

  /**
   * Get whether to show collections on document cards
   * @returns {boolean}
   */
  getShowCollections() {
    const val = localStorage.getItem('sv_show_collections')
    return val === null ? true : val === 'true'
  }

  /**
   * Set whether to show collections on document cards
   * @param {boolean} show
   */
  setShowCollections(show) {
    localStorage.setItem('sv_show_collections', show.toString())
  }

  getWikiEnabled() {
    return localStorage.getItem('sv_wiki_enabled') === 'true'
  }
}

export const settingsService = new SettingsService()
