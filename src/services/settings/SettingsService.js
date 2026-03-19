/**
 * SettingsService - Manages app settings
 *
 * Global settings stored in Box (_system/settings.json)
 * Device-specific settings stored in localStorage
 */
class SettingsService {
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
          crossref: true,
          semantic_scholar: true,
          ai: true
        },
        crossref_email: '',
        appearance: {
          theme: 'dark', // dark | light
          show_doc_counts: true,
          font_size: 'normal', // normal | large
          pdf_default_zoom: 100
        },
        export: {
          default_format: 'markdown',
          chat_include_citations: true,
          chat_include_timestamps: false
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
        remote = await adapter.readJSON('_system/settings.json')
      } catch {
        // Use defaults if file doesn't exist
      }
    }

    const deviceId = this.getDeviceId()
    const local = {
      ai_provider: localStorage.getItem('sv_ai_provider') || 'ollama',
      ai_model: localStorage.getItem('sv_ai_model') || 'llama3.2',
      claude_key_set: !!localStorage.getItem('sv_claude_key'),
      openai_key_set: !!localStorage.getItem('sv_openai_key')
    }

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
      existing = await adapter.readJSON('_system/settings.json')
    } catch {
      // Use defaults if file doesn't exist
    }

    // Merge global settings
    existing.global = { ...existing.global, ...globalSettings }

    // Update device record
    existing.devices[this.getDeviceId()] = {
      device_name: this.getDeviceName(),
      last_seen: new Date().toISOString(),
      ai_provider: localStorage.getItem('sv_ai_provider'),
      ai_model: localStorage.getItem('sv_ai_model')
    }

    await adapter.writeJSON('_system/settings.json', existing)
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
   * Save AI provider to localStorage
   * @param {string} provider
   */
  setAIProvider(provider) {
    localStorage.setItem('sv_ai_provider', provider)
  }

  /**
   * Save AI model to localStorage
   * @param {string} model
   */
  setAIModel(model) {
    localStorage.setItem('sv_ai_model', model)
  }

  /**
   * Get AI provider from localStorage
   * @returns {string}
   */
  getAIProvider() {
    return localStorage.getItem('sv_ai_provider') || 'ollama'
  }

  /**
   * Get AI model from localStorage
   * @returns {string}
   */
  getAIModel() {
    return localStorage.getItem('sv_ai_model') || 'llama3.2'
  }
}

export const settingsService = new SettingsService()
