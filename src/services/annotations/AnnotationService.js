/**
 * AnnotationService - Manages PDF annotation persistence to Box/Dropbox storage
 *
 * Annotations are stored in _system/annotations.json
 * Structure: { version: "1.0", annotations: { [docId]: [annotation objects] } }
 */

import { nanoid } from 'nanoid'

let annotationsCache = null
let saveTimer = null
const AUTOSAVE_DELAY = 1000 // 1 second after last change

/**
 * Annotation color presets matching Zotero
 */
export const ANNOTATION_COLORS = {
  yellow: '#FFEB3B',
  red: '#F44336',
  green: '#4CAF50',
  blue: '#2196F3',
  purple: '#9C27B0',
  orange: '#FF9800',
  gray: '#9E9E9E',
  cyan: '#00BCD4'
}

export const DEFAULT_HIGHLIGHT_COLOR = ANNOTATION_COLORS.yellow

export const AnnotationService = {
  /**
   * Load all annotations from storage
   * @param {StorageAdapter} adapter - The storage adapter
   * @returns {Promise<Object>} Annotations object keyed by docId
   */
  async loadAnnotations(adapter) {
    if (annotationsCache) return annotationsCache

    try {
      const data = await adapter.readJSON('_system/annotations.json')
      annotationsCache = data.annotations || {}
      return annotationsCache
    } catch (error) {
      if (error.code === 'STORAGE_NOT_FOUND') {
        // First run - create empty annotations file
        annotationsCache = {}
        return annotationsCache
      }
      throw error
    }
  },

  /**
   * Get annotations for a specific document
   * @param {string} docId - Document ID
   * @returns {Array} Array of annotation objects
   */
  getAnnotationsForDoc(docId) {
    if (!annotationsCache) return []
    return annotationsCache[docId] || []
  },

  /**
   * Create a new annotation
   * @param {string} type - 'highlight' | 'area' | 'underline' | 'note'
   * @param {Object} position - Position data with page, rects, boundingRect
   * @param {Object} content - Content with text and optional image
   * @param {Object} options - Additional options (color, comment, tags)
   * @returns {Object} The new annotation object
   */
  createAnnotation(type, position, content, options = {}) {
    const now = new Date().toISOString()
    return {
      id: `ann_${nanoid(10)}`,
      type,
      color: options.color || DEFAULT_HIGHLIGHT_COLOR,
      created_at: now,
      updated_at: now,
      position,
      content,
      comment: options.comment || '',
      tags: options.tags || [],
      ai_context: {
        include_in_embeddings: true
      },
      source: options.source || 'user'
    }
  },

  /**
   * Add an annotation for a document (saves immediately)
   * @param {StorageAdapter} adapter - The storage adapter
   * @param {string} docId - Document ID
   * @param {Object} annotation - The annotation object
   * @param {Object} callbacks - onSaveStart, onSaveComplete, onSaveError
   */
  async addAnnotation(adapter, docId, annotation, callbacks = {}) {
    if (!annotationsCache) annotationsCache = {}
    if (!annotationsCache[docId]) annotationsCache[docId] = []

    annotationsCache[docId].push(annotation)

    // Save immediately instead of debouncing to ensure annotations persist
    try {
      callbacks.onSaveStart?.()
      await this._persistAnnotations(adapter)
      callbacks.onSaveComplete?.()
    } catch (error) {
      console.error('[AnnotationService] Failed to save annotation:', error)
      callbacks.onSaveError?.(error)
    }
  },

  /**
   * Update an existing annotation
   * @param {StorageAdapter} adapter - The storage adapter
   * @param {string} docId - Document ID
   * @param {string} annotationId - Annotation ID
   * @param {Object} updates - Fields to update
   * @param {Object} callbacks - onSaveStart, onSaveComplete, onSaveError
   */
  updateAnnotation(adapter, docId, annotationId, updates, callbacks = {}) {
    if (!annotationsCache || !annotationsCache[docId]) return false

    const index = annotationsCache[docId].findIndex(a => a.id === annotationId)
    if (index === -1) return false

    annotationsCache[docId][index] = {
      ...annotationsCache[docId][index],
      ...updates,
      updated_at: new Date().toISOString()
    }

    this._scheduleAutoSave(adapter, callbacks)
    return true
  },

  /**
   * Delete an annotation
   * @param {StorageAdapter} adapter - The storage adapter
   * @param {string} docId - Document ID
   * @param {string} annotationId - Annotation ID
   * @param {Object} callbacks - onSaveStart, onSaveComplete, onSaveError
   */
  deleteAnnotation(adapter, docId, annotationId, callbacks = {}) {
    if (!annotationsCache || !annotationsCache[docId]) return false

    const index = annotationsCache[docId].findIndex(a => a.id === annotationId)
    if (index === -1) return false

    annotationsCache[docId].splice(index, 1)

    // Clean up empty arrays
    if (annotationsCache[docId].length === 0) {
      delete annotationsCache[docId]
    }

    this._scheduleAutoSave(adapter, callbacks)
    return true
  },

  /**
   * Bulk import annotations (e.g., from Zotero import or PDF extraction)
   * @param {StorageAdapter} adapter - The storage adapter
   * @param {string} docId - Document ID
   * @param {Array} annotations - Array of annotation objects
   * @param {Object} callbacks - onSaveStart, onSaveComplete, onSaveError
   */
  async importAnnotations(adapter, docId, annotations, callbacks = {}) {
    if (!annotationsCache) annotationsCache = {}
    if (!annotationsCache[docId]) annotationsCache[docId] = []

    // Add source marker and ensure IDs
    const now = new Date().toISOString()
    const importedAnnotations = annotations.map(ann => ({
      ...ann,
      id: ann.id || `ann_${nanoid(10)}`,
      created_at: ann.created_at || now,
      updated_at: now,
      source: ann.source || 'pdf_import'
    }))

    annotationsCache[docId].push(...importedAnnotations)

    // Immediate save for bulk imports
    try {
      callbacks.onSaveStart?.()
      await this._persistAnnotations(adapter)
      callbacks.onSaveComplete?.()
    } catch (error) {
      console.error('Failed to save imported annotations:', error)
      callbacks.onSaveError?.(error)
      throw error
    }
  },

  /**
   * Schedule debounced auto-save
   * @private
   */
  _scheduleAutoSave(adapter, callbacks = {}) {
    if (saveTimer) {
      clearTimeout(saveTimer)
    }

    saveTimer = setTimeout(async () => {
      try {
        callbacks.onSaveStart?.()
        await this._persistAnnotations(adapter)
        callbacks.onSaveComplete?.()
      } catch (error) {
        console.error('Failed to save annotations:', error)
        callbacks.onSaveError?.(error)
      }
    }, AUTOSAVE_DELAY)
  },

  /**
   * Force immediate save (used when closing viewer or switching docs)
   * @param {StorageAdapter} adapter - The storage adapter
   */
  async flushSave(adapter) {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    if (annotationsCache) {
      await this._persistAnnotations(adapter)
    }
  },

  /**
   * Internal: persist annotations cache to storage
   * @param {StorageAdapter} adapter - The storage adapter
   * @private
   */
  async _persistAnnotations(adapter) {
    const data = {
      version: '1.0',
      annotations: annotationsCache
    }
    console.log('[AnnotationService] Persisting annotations to storage:', {
      totalDocs: Object.keys(annotationsCache || {}).length,
      annotations: annotationsCache
    })
    await adapter.writeJSON('_system/annotations.json', data)
    console.log('[AnnotationService] Annotations persisted successfully')
  },

  /**
   * Get annotation count for a document
   * @param {string} docId - Document ID
   * @returns {number} Number of annotations
   */
  getAnnotationCount(docId) {
    if (!annotationsCache || !annotationsCache[docId]) return 0
    return annotationsCache[docId].length
  },

  /**
   * Get all annotations for AI context (for indexing)
   * @param {string} docId - Document ID
   * @returns {Array} Annotations marked for embedding inclusion
   */
  getAnnotationsForAI(docId) {
    const annotations = this.getAnnotationsForDoc(docId)
    return annotations.filter(a => a.ai_context?.include_in_embeddings !== false)
  },

  /**
   * Clear cache (used on logout/disconnect)
   */
  clearCache() {
    annotationsCache = null
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }
}
