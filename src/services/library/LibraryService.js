import { nanoid } from 'nanoid'

const LIBRARY_PATH = '_system/library.json'

const CURRENT_VERSION = '1.1'

function createEmptyLibrary() {
  return {
    version: CURRENT_VERSION,
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
  const version = library.version || '1.0'

  // v1.0 → v1.1: Add collection_registry
  if (version === '1.0') {
    library.collection_registry = library.collection_registry || {}
    library.version = '1.1'
    library.schema_updated = new Date().toISOString().split('T')[0]
    console.log('Migrated library from v1.0 to v1.1 (added collection_registry)')
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

  async saveLibrary(adapter, library) {
    library.last_modified = new Date().toISOString()
    await adapter.writeJSON(LIBRARY_PATH, library)
  },

  async addFolder(adapter, library, folderData) {
    const folder = {
      id: `f_${nanoid(10)}`,
      name: folderData.name,
      slug: folderData.name.toLowerCase().replace(/\s+/g, '-'),
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
    const doc = {
      id: `d_${nanoid(10)}`,
      folder_id: docData.folder_id,
      box_path: `PDFs/${docData.filename}`,
      box_file_id: null, // Set after upload
      filename: docData.filename,
      added_at: new Date().toISOString(),
      added_by: 'local',
      metadata: docData.metadata || {},
      user_data: {
        read: false,
        read_at: null,
        starred: false,
        tags: docData.tags || [],
        rating: null,
        custom_fields: {},
      },
      index_status: {
        status: 'none',
        indexed_at: null,
        indexed_on_device: null,
        model_used: null,
        chunk_count: 0,
        embedding_version: null,
      },
    }

    // Upload file
    if (file) {
      const fileId = await adapter.uploadFile(doc.box_path, file)
      doc.box_file_id = fileId
    }

    library.documents[doc.id] = doc
    await this.saveLibrary(adapter, library)
    return doc
  },

  async attachPdf(adapter, library, docId, file, filename) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    const box_path = `PDFs/${filename}`
    const box_file_id = await adapter.uploadFile(box_path, file)

    doc.box_path = box_path
    doc.box_file_id = box_file_id
    doc.filename = filename

    await this.saveLibrary(adapter, library)
    return doc
  },

  async replacePdf(adapter, library, docId, file, filename) {
    const doc = library.documents[docId]
    if (!doc) {
      throw new Error(`Document not found: ${docId}`)
    }

    const box_path = `PDFs/${filename}`
    const box_file_id = await adapter.uploadFile(box_path, file)

    doc.box_path = box_path
    doc.box_file_id = box_file_id
    doc.filename = filename
    doc.index_status = {
      status: 'none',
      indexed_at: null,
      indexed_on_device: null,
      model_used: null,
      chunk_count: 0,
      embedding_version: null,
    }

    await this.saveLibrary(adapter, library)
    return doc
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

    // Delete file from storage
    try {
      await adapter.deleteFile(doc.box_path)
    } catch (e) {
      console.warn('Failed to delete file:', e)
    }

    delete library.documents[docId]
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
