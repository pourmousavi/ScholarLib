/**
 * NotesService - Manages note persistence to Box/Dropbox storage
 *
 * Notes are stored in _system/notes.json as per LIBRARY_SCHEMA.md
 */

let notesCache = null
let saveTimer = null
const AUTOSAVE_DELAY = 1500 // 1.5 seconds after last keystroke

export const NotesService = {
  /**
   * Load all notes from storage
   * @param {StorageAdapter} adapter - The storage adapter
   * @returns {Promise<Object>} Notes object keyed by docId
   */
  async loadNotes(adapter) {
    if (notesCache) return notesCache

    try {
      const data = await adapter.readJSON('_system/notes.json')
      notesCache = data.notes || {}
      return notesCache
    } catch (error) {
      if (error.code === 'STORAGE_NOT_FOUND') {
        // First run - create empty notes file
        notesCache = {}
        return notesCache
      }
      throw error
    }
  },

  /**
   * Get note for a specific document
   * @param {string} docId - Document ID
   * @returns {Object} Note object or empty note
   */
  getNoteForDoc(docId) {
    if (!notesCache) return this.createEmptyNote()
    return notesCache[docId] || this.createEmptyNote()
  },

  /**
   * Create an empty note structure
   * @returns {Object} Empty note object
   */
  createEmptyNote() {
    return {
      content: '',
      tags: [],
      created_at: null,
      updated_at: null,
      ai_summary: null,
      ai_summary_generated_at: null
    }
  },

  /**
   * Save a note for a document (debounced auto-save)
   * @param {StorageAdapter} adapter - The storage adapter
   * @param {string} docId - Document ID
   * @param {Object} noteData - Note content and tags
   * @param {Function} onSaveStart - Callback when save starts
   * @param {Function} onSaveComplete - Callback when save completes
   * @param {Function} onSaveError - Callback on save error
   */
  saveNote(adapter, docId, noteData, { onSaveStart, onSaveComplete, onSaveError } = {}) {
    // Clear any existing timer
    if (saveTimer) {
      clearTimeout(saveTimer)
    }

    // Update local cache immediately
    const now = new Date().toISOString()
    if (!notesCache) notesCache = {}

    const existingNote = notesCache[docId]
    notesCache[docId] = {
      ...noteData,
      created_at: existingNote?.created_at || now,
      updated_at: now,
      ai_summary: existingNote?.ai_summary || null,
      ai_summary_generated_at: existingNote?.ai_summary_generated_at || null
    }

    // Debounced save to storage
    saveTimer = setTimeout(async () => {
      try {
        onSaveStart?.()
        await this._persistNotes(adapter)
        onSaveComplete?.()
      } catch (error) {
        console.error('Failed to save notes:', error)
        onSaveError?.(error)
      }
    }, AUTOSAVE_DELAY)
  },

  /**
   * Force immediate save (used when closing panel or switching docs)
   * @param {StorageAdapter} adapter - The storage adapter
   */
  async flushSave(adapter) {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    if (notesCache) {
      await this._persistNotes(adapter)
    }
  },

  /**
   * Internal: persist notes cache to storage
   * @param {StorageAdapter} adapter - The storage adapter
   */
  async _persistNotes(adapter) {
    const data = {
      version: '1.0',
      notes: notesCache
    }
    await adapter.writeJSON('_system/notes.json', data)
  },

  /**
   * Update AI summary for a note
   * @param {StorageAdapter} adapter - The storage adapter
   * @param {string} docId - Document ID
   * @param {string} summary - AI-generated summary
   */
  async updateAISummary(adapter, docId, summary) {
    if (!notesCache) notesCache = {}

    const existingNote = notesCache[docId] || this.createEmptyNote()
    const now = new Date().toISOString()

    notesCache[docId] = {
      ...existingNote,
      ai_summary: summary,
      ai_summary_generated_at: now,
      updated_at: now
    }

    await this._persistNotes(adapter)
  },

  /**
   * Delete a note
   * @param {StorageAdapter} adapter - The storage adapter
   * @param {string} docId - Document ID
   */
  async deleteNote(adapter, docId) {
    if (!notesCache || !notesCache[docId]) return

    delete notesCache[docId]
    await this._persistNotes(adapter)
  },

  /**
   * Clear cache (used on logout/disconnect)
   */
  clearCache() {
    notesCache = null
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }
}
