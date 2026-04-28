import { ulid } from 'ulid'
import { StorageError, STORAGE_ERRORS } from './StorageAdapter'

function normalizePath(path) {
  return String(path || '').replace(/^\/+/, '').replace(/\/+/g, '/')
}

function parentPath(path) {
  const parts = normalizePath(path).split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function fileName(path) {
  const parts = normalizePath(path).split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

async function blobToText(blob) {
  if (typeof blob === 'string') return blob
  if (blob && typeof blob.text === 'function') return blob.text()
  return String(blob ?? '')
}

export class MemoryAdapter {
  constructor(seed = {}) {
    this.files = new Map()
    this.folders = new Set(['', '_system', '_system/index', 'PDFs'])

    Object.entries(seed).forEach(([path, value]) => {
      if (value?.type === 'folder') {
        this.folders.add(normalizePath(path))
      } else {
        const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
        this._putFile(path, text, 'application/octet-stream')
      }
    })
  }

  getProviderName() {
    return 'memory'
  }

  async isConnected() {
    return true
  }

  connect() {}

  async handleCallback() {}

  async disconnect() {
    this.files.clear()
    this.folders.clear()
    this.folders.add('')
  }

  async refreshTokenIfNeeded() {}

  async readJSON(path) {
    const { text } = await this.readTextWithMetadata(path)
    return JSON.parse(text)
  }

  async writeJSON(path, data) {
    const content = JSON.stringify(data, null, 2)
    const existing = await this._maybeMetadata(path)
    await this.writeTextIfRevision(path, content, existing?.revision ?? null)
  }

  async downloadFile(path) {
    const entry = this._getFile(path)
    return new Blob([entry.text], { type: entry.contentType })
  }

  async uploadFile(path, file) {
    const text = await blobToText(file)
    const type = file?.type || 'application/octet-stream'
    this._putFile(path, text, type)
    return normalizePath(path)
  }

  async deleteFile(path) {
    const normalized = normalizePath(path)
    if (!this.files.delete(normalized) && !this.folders.delete(normalized)) {
      throw new StorageError(STORAGE_ERRORS.NOT_FOUND, `Path not found: ${path}`)
    }
  }

  async getFileStreamURL(path) {
    return `memory://${normalizePath(path)}`
  }

  async listFolder(path) {
    const normalized = normalizePath(path)
    if (!this.folders.has(normalized)) {
      throw new StorageError(STORAGE_ERRORS.NOT_FOUND, `Folder not found: ${path}`)
    }

    const prefix = normalized ? `${normalized}/` : ''
    const rows = []

    for (const folder of this.folders) {
      if (!folder || !folder.startsWith(prefix) || folder === normalized) continue
      const rest = folder.slice(prefix.length)
      if (!rest.includes('/')) {
        rows.push({ id: folder, name: fileName(folder), type: 'folder', size: 0, modified: null })
      }
    }

    for (const [filePath, entry] of this.files) {
      if (!filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      if (!rest.includes('/')) {
        rows.push({
          id: filePath,
          name: fileName(filePath),
          type: 'file',
          size: entry.text.length,
          modified: entry.modified,
        })
      }
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }

  async createFolder(path) {
    const normalized = normalizePath(path)
    const parts = normalized.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current = current ? `${current}/${part}` : part
      this.folders.add(current)
    }
    return normalized
  }

  async readTextWithMetadata(path) {
    const entry = this._getFile(path)
    return {
      text: entry.text,
      metadata: this._metadataFor(normalizePath(path), entry),
    }
  }

  async writeTextIfRevision(path, text, expectedRevision) {
    const normalized = normalizePath(path)
    const existing = this.files.get(normalized)

    if (expectedRevision === null || expectedRevision === undefined) {
      if (existing) {
        throw new StorageError(STORAGE_ERRORS.REVISION_CONFLICT, `File already exists: ${path}`)
      }
    } else if (!existing || existing.revision !== expectedRevision) {
      throw new StorageError(STORAGE_ERRORS.REVISION_CONFLICT, `Revision mismatch: ${path}`)
    }

    return this._putFile(normalized, text, 'text/plain')
  }

  async getMetadata(path) {
    const normalized = normalizePath(path)
    const file = this.files.get(normalized)
    if (file) return this._metadataFor(normalized, file)
    if (this.folders.has(normalized)) {
      return { id: normalized, path: normalized, name: fileName(normalized), type: 'folder', revision: null }
    }
    throw new StorageError(STORAGE_ERRORS.NOT_FOUND, `Path not found: ${path}`)
  }

  _getFile(path) {
    const normalized = normalizePath(path)
    const entry = this.files.get(normalized)
    if (!entry) {
      throw new StorageError(STORAGE_ERRORS.NOT_FOUND, `File not found: ${path}`)
    }
    return entry
  }

  async _maybeMetadata(path) {
    try {
      return await this.getMetadata(path)
    } catch (error) {
      if (error.code === STORAGE_ERRORS.NOT_FOUND) return null
      throw error
    }
  }

  _putFile(path, text, contentType) {
    const normalized = normalizePath(path)
    const folder = parentPath(normalized)
    if (folder) this.createFolder(folder)

    const entry = {
      text,
      contentType,
      revision: ulid(),
      modified: new Date().toISOString(),
    }
    this.files.set(normalized, entry)
    return this._metadataFor(normalized, entry)
  }

  _metadataFor(path, entry) {
    return {
      id: path,
      path,
      name: fileName(path),
      type: 'file',
      revision: entry.revision,
      modified: entry.modified,
      size: entry.text.length,
    }
  }
}
