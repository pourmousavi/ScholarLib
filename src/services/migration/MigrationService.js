/**
 * MigrationService - Handles export/import of library data for storage provider migration
 *
 * Export bundle format (.scholarlib JSON):
 * {
 *   schema_version: "1.0",
 *   export_date: ISO timestamp,
 *   source_provider: "box" | "dropbox",
 *   library: { full library.json },
 *   notes: { full notes.json },
 *   chat_history: { full chat_history.json },
 *   file_manifest: { docId: { filename, original_path } }
 * }
 */

const SCHEMA_VERSION = '1.0'

class MigrationService {
  /**
   * Export all library data to a .scholarlib bundle
   * @param {object} adapter - Storage adapter
   * @param {string} provider - Current provider name ('box' or 'dropbox')
   * @returns {Promise<object>} Export bundle data
   */
  async exportBundle(adapter, provider) {
    // Load all data sources
    const [library, notes, chatHistory] = await Promise.all([
      this._loadLibrary(adapter),
      this._loadNotes(adapter),
      this._loadChatHistory(adapter)
    ])

    // Build file manifest from documents
    const fileManifest = {}
    if (library?.documents) {
      for (const [docId, doc] of Object.entries(library.documents)) {
        fileManifest[docId] = {
          filename: doc.filename,
          original_path: doc.box_path
        }
      }
    }

    const bundle = {
      schema_version: SCHEMA_VERSION,
      export_date: new Date().toISOString(),
      source_provider: provider,
      library,
      notes,
      chat_history: chatHistory,
      file_manifest: fileManifest
    }

    return bundle
  }

  /**
   * Download bundle as a file
   * @param {object} bundle - Export bundle data
   * @param {string} filename - Filename without extension
   */
  downloadBundle(bundle, filename = 'scholarlib-export') {
    const content = JSON.stringify(bundle, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.scholarlib`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Parse and validate an uploaded bundle file
   * @param {File} file - Uploaded .scholarlib file
   * @returns {Promise<object>} Parsed bundle data
   */
  async parseBundle(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const bundle = JSON.parse(e.target.result)

          // Validate bundle structure
          const validation = this.validateBundle(bundle)
          if (!validation.valid) {
            reject(new Error(validation.error))
            return
          }

          resolve(bundle)
        } catch (err) {
          reject(new Error('Invalid bundle file: ' + err.message))
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read bundle file'))
      }

      reader.readAsText(file)
    })
  }

  /**
   * Validate bundle structure
   * @param {object} bundle - Bundle to validate
   * @returns {object} { valid: boolean, error?: string }
   */
  validateBundle(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      return { valid: false, error: 'Bundle is not a valid JSON object' }
    }

    if (!bundle.schema_version) {
      return { valid: false, error: 'Bundle missing schema_version' }
    }

    if (!bundle.library) {
      return { valid: false, error: 'Bundle missing library data' }
    }

    if (!bundle.library.folders || !bundle.library.documents) {
      return { valid: false, error: 'Bundle library data is incomplete' }
    }

    return { valid: true }
  }

  /**
   * Get bundle summary for display
   * @param {object} bundle - Parsed bundle
   * @returns {object} Summary stats
   */
  getBundleSummary(bundle) {
    const folderCount = bundle.library?.folders?.length || 0
    const documentCount = Object.keys(bundle.library?.documents || {}).length
    const noteCount = Object.keys(bundle.notes?.notes || {}).length
    const conversationCount = bundle.chat_history?.conversations?.length || 0

    return {
      folderCount,
      documentCount,
      noteCount,
      conversationCount,
      sourceProvider: bundle.source_provider,
      exportDate: bundle.export_date
    }
  }

  /**
   * Import bundle data into storage (after PDF relinking)
   * @param {object} adapter - Storage adapter
   * @param {object} bundle - Bundle with updated document paths
   * @param {object} options - Import options
   */
  async importBundle(adapter, bundle, options = {}) {
    const { mode = 'replace' } = options

    if (mode === 'replace') {
      // Replace all existing data
      await this._saveLibrary(adapter, bundle.library)

      if (bundle.notes) {
        await this._saveNotes(adapter, bundle.notes)
      }

      if (bundle.chat_history) {
        await this._saveChatHistory(adapter, bundle.chat_history)
      }
    } else if (mode === 'merge') {
      // Merge with existing data (TODO: implement merge logic)
      throw new Error('Merge mode not yet implemented')
    }
  }

  /**
   * Load library.json
   * @private
   */
  async _loadLibrary(adapter) {
    try {
      return await adapter.readJSON('_system/library.json')
    } catch {
      return { version: '1.0', folders: [], documents: {} }
    }
  }

  /**
   * Load notes.json
   * @private
   */
  async _loadNotes(adapter) {
    try {
      return await adapter.readJSON('_system/notes.json')
    } catch {
      return { version: '1.0', notes: {} }
    }
  }

  /**
   * Load chat_history.json
   * @private
   */
  async _loadChatHistory(adapter) {
    try {
      return await adapter.readJSON('_system/chat_history.json')
    } catch {
      return { version: '1.0', conversations: [] }
    }
  }

  /**
   * Save library.json
   * @private
   */
  async _saveLibrary(adapter, library) {
    library.last_modified = new Date().toISOString()
    library.last_modified_by = 'migration'
    await adapter.writeJSON('_system/library.json', library)
  }

  /**
   * Save notes.json
   * @private
   */
  async _saveNotes(adapter, notes) {
    await adapter.writeJSON('_system/notes.json', notes)
  }

  /**
   * Save chat_history.json
   * @private
   */
  async _saveChatHistory(adapter, chatHistory) {
    await adapter.writeJSON('_system/chat_history.json', chatHistory)
  }
}

export const migrationService = new MigrationService()
