import { nanoid } from 'nanoid'

const LIBRARY_PATH = '_system/library.json'

const CURRENT_VERSION = '1.3'

/**
 * Sanitize a filename for safe storage.
 * Strips path separators, collapses '..' segments, removes control chars,
 * and truncates to 200 chars preserving the extension.
 */
export function sanitizeFilename(name) {
  if (!name) return name

  // Strip path separators and collapse '..' segments
  let sanitized = name.replace(/[/\\]/g, '').replace(/\.\./g, '')
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f]/g, '')
  // Trim whitespace
  sanitized = sanitized.trim()

  // Truncate to 200 chars, preserving extension
  if (sanitized.length > 200) {
    const lastDot = sanitized.lastIndexOf('.')
    if (lastDot > 0) {
      const ext = sanitized.slice(lastDot)
      sanitized = sanitized.slice(0, 200 - ext.length) + ext
    } else {
      sanitized = sanitized.slice(0, 200)
    }
  }

  // If result is empty or just an extension (e.g. ".pdf")
  if (!sanitized || /^\.[^.]*$/.test(sanitized)) {
    throw new Error('Invalid filename')
  }

  return sanitized
}

/**
 * Generate a unique slug for a folder, appending -2, -3, etc. if needed.
 */
export function uniqueSlug(baseName, existingSlugs) {
  const baseSlug = baseName.toLowerCase().replace(/\s+/g, '-')
  if (!existingSlugs.includes(baseSlug)) return baseSlug
  let counter = 2
  while (existingSlugs.includes(`${baseSlug}-${counter}`)) {
    counter++
  }
  return `${baseSlug}-${counter}`
}

export class LibraryConflictError extends Error {
  constructor(message, { onDisk, local } = {}) {
    super(message)
    this.name = 'LibraryConflictError'
    this.onDisk = onDisk
    this.local = local
  }
}

function createEmptyLibrary() {
  return {
    version: CURRENT_VERSION,
    schema_revision: 0,
    schema_updated: new Date().toISOString().split('T')[0],
    last_modified: new Date().toISOString(),
    last_modified_by: 'local',
    folders: [],
    documents: {},
    tag_registry: {},
    collection_registry: {},
    smart_collections: [],
  }
}

/**
 * Migrate library data from older versions to current version
 */
function migrateLibrary(library) {
  let version = library.version || '1.0'

  // v1.0 → v1.1: Add collection_registry
  if (version === '1.0') {
    library.collection_registry = library.collection_registry || {}
    library.version = '1.1'
    library.schema_updated = new Date().toISOString().split('T')[0]
    console.log('Migrated library from v1.0 to v1.1 (added collection_registry)')
    version = '1.1'
  }

  // v1.1 → v1.2: Add schema_revision for optimistic concurrency
  if (version === '1.1') {
    library.schema_revision = library.schema_revision ?? 0
    library.version = '1.2'
    library.schema_updated = new Date().toISOString().split('T')[0]
    console.log('Migrated library from v1.1 to v1.2 (added schema_revision)')
    version = '1.2'
  }

  // v1.2 → v1.3: Add reference_type for news article support
  if (version === '1.2') {
    for (const doc of Object.values(library.documents || {})) {
      doc.reference_type = doc.reference_type || 'paper'
    }
    library.version = '1.3'
    library.schema_updated = new Date().toISOString().split('T')[0]
    console.log('Migrated library from v1.2 to v1.3 (added reference_type for news support)')
  }

  return library
}

export const LibraryService = {
  async loadLibrary(adapter) {
    try {
      let library = await adapter.readJSON(LIBRARY_PATH)

      // Migrate if needed
      const originalVersion = library.version
      library = migrateLibrary(library)

      // Save if migration occurred
      if (library.version !== originalVersion) {
        await this.saveLibrary(adapter, library)
      }

      // Clean up any orphaned files from failed deletes
      if (library.orphaned_files?.length > 0) {
        try { await this.cleanupOrphans(adapter, library) } catch (e) {
          console.warn('Orphan cleanup failed:', e)
        }
      }

      return library
    } catch (e) {
      if (e.code === 'STORAGE_NOT_FOUND') {
        // First run - create empty library
        const library = createEmptyLibrary()
        await this.saveLibrary(adapter, library)
        return library
      }
      throw e
    }
  },

  async saveLibrary(adapter, library, { expectedRevision, modifiedBy } = {}) {
    const hasRevision = expectedRevision != null || 'schema_revision' in library

    // Optimistic concurrency check — only enforced when the library
    // object carries a schema_revision (i.e. the full library loaded via
    // loadLibrary). Ad-hoc objects constructed by components skip both the
    // read and the check to avoid extra round-trips and race conditions.
    if (hasRevision) {
      let current
      try {
        current = await adapter.readJSON(LIBRARY_PATH)
      } catch (e) {
        if (e.code !== 'STORAGE_NOT_FOUND') throw e
        current = null
      }
      if (current) {
        const onDisk = current.schema_revision ?? 0
        const expected = expectedRevision ?? library.schema_revision ?? 0
        if (onDisk !== expected) {
          throw new LibraryConflictError(
            `Library was modified by another session (disk: ${onDisk}, expected: ${expected})`,
            { onDisk: current, local: library }
          )
        }
      }
    }

    library.schema_revision = (library.schema_revision ?? 0) + 1
    library.last_modified = new Date().toISOString()
    library.last_modified_by = modifiedBy || library.last_modified_by || 'local'
    await adapter.writeJSON(LIBRARY_PATH, library)
  },

  async addFolder(adapter, library, folderData) {
    const existingSlugs = library.folders.map(f => f.slug)
    const folder = {
      id: `f_${nanoid(10)}`,
      name: folderData.name,
      slug: uniqueSlug(folderData.name, existingSlugs),
      parent_id: folderData.parent_id || null,
      children: [],
      created_at: new Date().toISOString(),
      shared_with: [],
      color: null,
      icon: null,
      sort_order: library.folders.filter(f => f.parent_id === folderData.parent_id).length,
    }

    library.folders.push(folder)

    // Update parent's children array
    if (folder.parent_id) {
      const parent = library.folders.find(f => f.id === folder.parent_id)
      if (parent) {
        parent.children.push(folder.id)
      }
    }

    await this.saveLibrary(adapter, library)
    return folder
  },

  async addDocument(adapter, library, docData, file) {
    const sanitizedFilename = docData.filename ? sanitizeFilename(docData.filename) : ''
    const isNews = docData.reference_type === 'news_article'

    // News files go under News/{slug}/, papers under PDFs/
    const storagePath = sanitizedFilename
      ? (isNews ? `News/${sanitizedFilename}` : `PDFs/${sanitizedFilename}`)
      : ''

    const doc = {
      id: `d_${nanoid(10)}`,
      folder_id: docData.folder_id,
      reference_type: docData.reference_type || 'paper',
      box_path: storagePath,
      box_file_id: null,
      filename: sanitizedFilename,
      added_at: new Date().toISOString(),
      added_by: docData.added_by || 'local',
      // News-specific fields (null for papers)
      source_name: docData.source_name || null,
      published_at: docData.published_at || null,
      url: docData.url || null,
      ai_chat_source_file: docData.ai_chat_source_file || null,
      files: docData.files || [],
      metadata: docData.metadata || {},
      user_data: {
        read: false,
        read_at: null,
        starred: false,
        tags: docData.tags || [],
        rating: null,
        custom_fields: {},
      },
      import_source: docData.import_source || null,
      index_status: {
        status: 'none',
        indexed_at: null,
        indexed_on_device: null,
        model_used: null,
        chunk_count: 0,
        embedding_version: null,
      },
    }

    let uploadedFileId = null
    try {
      if (file) {
        uploadedFileId = await adapter.uploadFile(doc.box_path, file)
        doc.box_file_id = uploadedFileId
      }
      library.documents[doc.id] = doc
      await this.saveLibrary(adapter, library)
      return doc
    } catch (err) {
      // Rollback: if we uploaded but couldn't save the library, delete the upload
      if (uploadedFileId) {
        try { await adapter.deleteFile(doc.box_path) } catch (e) {
          console.warn('Rollback failed — orphan file may exist at', doc.box_path, e)
        }
      }
      delete library.documents[doc.id]
      throw err
    }
  },

  async attachPdf(adapter, library, docId, file, filename) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    const sanitized = sanitizeFilename(filename)
    const box_path = `PDFs/${sanitized}`
    const box_file_id = await adapter.uploadFile(box_path, file)

    const prevPath = doc.box_path
    const prevFileId = doc.box_file_id
    const prevFilename = doc.filename

    doc.box_path = box_path
    doc.box_file_id = box_file_id
    doc.filename = sanitized

    try {
      await this.saveLibrary(adapter, library)
      return doc
    } catch (err) {
      // Rollback: restore previous values and try to delete the new upload
      doc.box_path = prevPath
      doc.box_file_id = prevFileId
      doc.filename = prevFilename
      try { await adapter.deleteFile(box_path) } catch (e) {
        console.warn('Rollback failed — orphan file may exist at', box_path, e)
      }
      throw err
    }
  },

  async replacePdf(adapter, library, docId, file, filename) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    const sanitized = sanitizeFilename(filename)
    const box_path = `PDFs/${sanitized}`
    const box_file_id = await adapter.uploadFile(box_path, file)

    const prevPath = doc.box_path
    const prevFileId = doc.box_file_id
    const prevFilename = doc.filename
    const prevIndexStatus = { ...doc.index_status }

    doc.box_path = box_path
    doc.box_file_id = box_file_id
    doc.filename = sanitized
    doc.index_status = {
      status: 'none',
      indexed_at: null,
      indexed_on_device: null,
      model_used: null,
      chunk_count: 0,
      embedding_version: null,
    }

    try {
      await this.saveLibrary(adapter, library)
      return doc
    } catch (err) {
      // Rollback: restore previous values and try to delete the new upload
      doc.box_path = prevPath
      doc.box_file_id = prevFileId
      doc.filename = prevFilename
      doc.index_status = prevIndexStatus
      try { await adapter.deleteFile(box_path) } catch (e) {
        console.warn('Rollback failed — orphan file may exist at', box_path, e)
      }
      throw err
    }
  },

  async updateDocument(adapter, library, docId, updates) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    Object.assign(doc, updates)
    await this.saveLibrary(adapter, library)
    return doc
  },

  async updateDocumentMetadata(adapter, library, docId, metadata) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    doc.metadata = { ...doc.metadata, ...metadata }
    await this.saveLibrary(adapter, library)
    return doc
  },

  async updateDocIndexStatus(adapter, library, docId, status, details = {}) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    doc.index_status = {
      ...doc.index_status,
      status,
      ...details,
      indexed_at: status === 'indexed' ? new Date().toISOString() : doc.index_status.indexed_at,
    }

    await this.saveLibrary(adapter, library)
    return doc
  },

  async deleteDocument(adapter, library, docId) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    // Collect all file paths to delete (primary + any additional files)
    const filePaths = []
    if (doc.box_path) filePaths.push(doc.box_path)
    if (doc.ai_chat_source_file && doc.ai_chat_source_file !== doc.box_path) {
      filePaths.push(doc.ai_chat_source_file)
    }
    for (const f of (doc.files || [])) {
      if (f.box_path && !filePaths.includes(f.box_path)) filePaths.push(f.box_path)
    }

    // Remove from library and save first — this is the authoritative operation
    delete library.documents[docId]
    await this.saveLibrary(adapter, library)

    // Then try to delete all files from storage
    for (const filePath of filePaths) {
      try {
        await adapter.deleteFile(filePath)
      } catch (e) {
        console.warn('Failed to delete file, tracking as orphan:', filePath, e)
        if (!library.orphaned_files) library.orphaned_files = []
        library.orphaned_files.push(filePath)
        try { await this.saveLibrary(adapter, library) } catch { /* best effort */ }
      }
    }
  },

  async cleanupOrphans(adapter, library) {
    if (!library.orphaned_files || library.orphaned_files.length === 0) return

    const remaining = []
    for (const path of library.orphaned_files) {
      try {
        await adapter.deleteFile(path)
      } catch (e) {
        console.warn('Orphan cleanup failed for:', path, e)
        remaining.push(path)
      }
    }
    library.orphaned_files = remaining.length > 0 ? remaining : undefined
    await this.saveLibrary(adapter, library)
  },

  async moveDocument(adapter, library, docId, newFolderId) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    doc.folder_id = newFolderId
    await this.saveLibrary(adapter, library)
    return doc
  },

  findDuplicateByDOI(library, doi) {
    if (!doi) return null
    const normalizedDoi = doi.toLowerCase().trim()
    return Object.values(library.documents).find(
      doc => doc.metadata?.doi?.toLowerCase().trim() === normalizedDoi
    ) || null
  },

  findDuplicateByTitle(library, title) {
    if (!title) return null
    const normalized = title.toLowerCase().trim()
    return Object.values(library.documents).find(
      doc => doc.metadata?.title?.toLowerCase().trim() === normalized
    ) || null
  },

  async deleteFolder(adapter, library, folderId) {
    const folder = library.folders.find(f => f.id === folderId)
    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`)
    }

    // Check for documents in folder
    const docsInFolder = Object.values(library.documents).filter(d => d.folder_id === folderId)
    if (docsInFolder.length > 0) {
      throw new Error('Cannot delete folder with documents')
    }

    // Check for child folders
    if (folder.children.length > 0) {
      throw new Error('Cannot delete folder with subfolders')
    }

    // Remove from parent's children
    if (folder.parent_id) {
      const parent = library.folders.find(f => f.id === folder.parent_id)
      if (parent) {
        parent.children = parent.children.filter(id => id !== folderId)
      }
    }

    library.folders = library.folders.filter(f => f.id !== folderId)
    await this.saveLibrary(adapter, library)
  },
}
