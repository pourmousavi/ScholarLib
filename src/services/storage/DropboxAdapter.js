import { StorageError, STORAGE_ERRORS } from './StorageAdapter'

const DROPBOX_AUTH_URL = 'https://www.dropbox.com/oauth2/authorize'
const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const DROPBOX_API_BASE = 'https://api.dropboxapi.com/2'
const DROPBOX_CONTENT_BASE = 'https://content.dropboxapi.com/2'

// External configuration (for consumers like LitOrbit)
let _dropboxConfig = null

export function configureDropbox({ appKey, redirectUri }) {
  _dropboxConfig = { appKey, redirectUri }
}

function _getAppKey() {
  return _dropboxConfig?.appKey || import.meta.env.VITE_DROPBOX_APP_KEY
}

function _getRedirectUri() {
  return _dropboxConfig?.redirectUri || import.meta.env.VITE_DROPBOX_REDIRECT_URI ||
    `${window.location.origin}${import.meta.env.BASE_URL}auth/dropbox`
}

function generateState() {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

function generateCodeVerifier() {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export class DropboxAdapter {
  constructor() {
    this.rootPath = '/ScholarLib'
  }

  getProviderName() {
    return 'dropbox'
  }

  // Token management
  _getAccessToken() {
    const encoded = localStorage.getItem('sv_dropbox_access')
    return encoded ? atob(encoded) : null
  }

  _getRefreshToken() {
    const encoded = localStorage.getItem('sv_dropbox_refresh')
    return encoded ? atob(encoded) : null
  }

  _getExpiry() {
    return parseInt(localStorage.getItem('sv_dropbox_expiry') || '0', 10)
  }

  _storeTokens(accessToken, refreshToken, expiresIn) {
    const expiry = Date.now() + expiresIn * 1000
    localStorage.setItem('sv_dropbox_access', btoa(accessToken))
    if (refreshToken) {
      localStorage.setItem('sv_dropbox_refresh', btoa(refreshToken))
    }
    localStorage.setItem('sv_dropbox_expiry', expiry.toString())
  }

  _clearTokens() {
    localStorage.removeItem('sv_dropbox_access')
    localStorage.removeItem('sv_dropbox_refresh')
    localStorage.removeItem('sv_dropbox_expiry')
  }

  async _apiCall(endpoint, data, isContent = false) {
    await this.refreshTokenIfNeeded()
    const token = this._getAccessToken()

    if (!token) {
      throw new StorageError(STORAGE_ERRORS.NOT_CONNECTED, 'Not connected to Dropbox')
    }

    const baseUrl = isContent ? DROPBOX_CONTENT_BASE : DROPBOX_API_BASE
    const headers = {
      Authorization: `Bearer ${token}`,
    }

    let body
    if (isContent) {
      // Extract _content from data - only send metadata in Dropbox-API-Arg header
      const { _content, ...apiArgs } = data
      headers['Dropbox-API-Arg'] = JSON.stringify(apiArgs)
      // Only set Content-Type and body for uploads, not downloads
      if (_content) {
        headers['Content-Type'] = 'application/octet-stream'
        body = _content
      }
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(data)
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      ...(body && { body }),
    })

    if (!response.ok) {
      // Try to get error as JSON, fallback to text
      const responseText = await response.text()
      let error = {}
      try {
        error = JSON.parse(responseText)
      } catch {
        console.error('Dropbox API error (raw):', response.status, responseText)
      }

      if (response.status === 409 && error.error?.['.tag'] === 'path') {
        const pathError = error.error.path?.['.tag']
        if (pathError === 'not_found') {
          throw new StorageError(STORAGE_ERRORS.NOT_FOUND, 'File not found')
        }
      }

      // Handle 400 with path not found (Dropbox sometimes returns this for missing files)
      if (response.status === 400 || response.status === 409) {
        const errorTag = error.error?.['.tag']
        const pathTag = error.error?.path?.['.tag'] || error.error?.reason?.['.tag']
        if (error.error_summary?.includes('conflict') || pathTag === 'conflict') {
          throw new StorageError(STORAGE_ERRORS.REVISION_CONFLICT, 'Revision conflict')
        }
        if ((errorTag === 'path' && pathTag === 'not_found') || error.error_summary?.includes('not_found')) {
          throw new StorageError(STORAGE_ERRORS.NOT_FOUND, 'File not found')
        }
      }

      if (response.status === 401) {
        throw new StorageError(STORAGE_ERRORS.AUTH_EXPIRED, 'Authentication expired')
      }

      if (response.status === 429) {
        throw new StorageError(STORAGE_ERRORS.RATE_LIMITED, 'Rate limited')
      }

      console.error('Dropbox API error:', response.status, error)
      throw new StorageError(
        STORAGE_ERRORS.NETWORK_ERROR,
        error.error_summary || error.error_description || responseText || 'Dropbox API error'
      )
    }

    if (isContent && endpoint === '/files/download') {
      return response.blob()
    }

    const text = await response.text()
    return text ? JSON.parse(text) : {}
  }

  async isConnected() {
    const token = this._getAccessToken()
    if (!token) return false

    try {
      await this.refreshTokenIfNeeded()
      await this._apiCall('/users/get_current_account', null)
      return true
    } catch {
      return false
    }
  }

  connect() {
    const appKey = _getAppKey()
    const redirectUri = _getRedirectUri()

    if (!appKey) {
      throw new StorageError(
        STORAGE_ERRORS.NOT_CONNECTED,
        'Dropbox app not configured. Set VITE_DROPBOX_APP_KEY in .env.local'
      )
    }

    const verifier = generateCodeVerifier()
    sessionStorage.setItem('pkce_verifier', verifier)
    const state = generateState()
    sessionStorage.setItem('oauth_state', state)

    generateCodeChallenge(verifier).then((challenge) => {
      const params = new URLSearchParams({
        client_id: appKey,
        redirect_uri: redirectUri,
        response_type: 'code',
        token_access_type: 'offline',
        state: state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })

      window.location.href = `${DROPBOX_AUTH_URL}?${params}`
    })
  }

  async handleCallback(code, state) {
    const savedState = sessionStorage.getItem('oauth_state')
    if (state && state !== savedState) {
      throw new StorageError(STORAGE_ERRORS.NOT_CONNECTED, 'OAuth state mismatch')
    }

    const verifier = sessionStorage.getItem('pkce_verifier')
    if (!verifier) {
      throw new StorageError(STORAGE_ERRORS.NOT_CONNECTED, 'PKCE verifier not found')
    }

    const appKey = _getAppKey()
    const redirectUri = _getRedirectUri()

    const response = await fetch(DROPBOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: appKey,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new StorageError(
        STORAGE_ERRORS.NOT_CONNECTED,
        error.error_description || 'Token exchange failed'
      )
    }

    const { access_token, refresh_token, expires_in } = await response.json()
    this._storeTokens(access_token, refresh_token, expires_in || 14400)

    sessionStorage.removeItem('oauth_state')
    sessionStorage.removeItem('pkce_verifier')

    // Ensure root folder exists
    await this._ensureRootFolder()
  }

  async disconnect() {
    this._clearTokens()
  }

  async refreshTokenIfNeeded() {
    const expiry = this._getExpiry()
    if (Date.now() < expiry - 300000) return

    const refreshToken = this._getRefreshToken()
    if (!refreshToken) {
      throw new StorageError(STORAGE_ERRORS.AUTH_EXPIRED, 'No refresh token')
    }

    const appKey = _getAppKey()

    const response = await fetch(DROPBOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appKey,
      }),
    })

    if (!response.ok) {
      this._clearTokens()
      throw new StorageError(STORAGE_ERRORS.AUTH_EXPIRED, 'Token refresh failed')
    }

    const { access_token, expires_in } = await response.json()
    this._storeTokens(access_token, refreshToken, expires_in || 14400)
  }

  _getFullPath(path) {
    if (!path || path === '/') return this.rootPath
    return `${this.rootPath}/${path}`.replace(/\/+/g, '/')
  }

  async _ensureRootFolder() {
    try {
      await this._apiCall('/files/get_metadata', { path: this.rootPath })
    } catch (e) {
      if (e.code === STORAGE_ERRORS.NOT_FOUND) {
        await this._apiCall('/files/create_folder_v2', { path: this.rootPath })
        await this.createFolder('_system')
        await this.createFolder('_system/index')
        await this.createFolder('PDFs')
      } else {
        throw e
      }
    }
  }

  async readJSON(path) {
    const fullPath = this._getFullPath(path)
    const blob = await this._apiCall('/files/download', { path: fullPath }, true)
    const text = await blob.text()
    return JSON.parse(text)
  }

  async readTextWithMetadata(path) {
    const fullPath = this._getFullPath(path)
    const [blob, metadata] = await Promise.all([
      this._apiCall('/files/download', { path: fullPath }, true),
      this.getMetadata(path),
    ])
    return {
      text: await blob.text(),
      metadata,
    }
  }

  async writeJSON(path, data) {
    const fullPath = this._getFullPath(path)
    const content = JSON.stringify(data, null, 2)
    const blob = new Blob([content], { type: 'application/json' })

    await this._apiCall(
      '/files/upload',
      { path: fullPath, mode: { '.tag': 'overwrite' }, _content: blob },
      true
    )
  }

  async writeTextIfRevision(path, text, expectedRevision) {
    const fullPath = this._getFullPath(path)
    const blob = new Blob([text], { type: 'text/plain' })
    const mode = expectedRevision === null || expectedRevision === undefined
      ? { '.tag': 'add' }
      : { '.tag': 'update', update: expectedRevision }

    try {
      const result = await this._apiCall(
        '/files/upload',
        { path: fullPath, mode, _content: blob },
        true
      )
      return this._normalizeMetadata(result)
    } catch (error) {
      if (error.code === STORAGE_ERRORS.NETWORK_ERROR && /conflict/i.test(error.message || '')) {
        throw new StorageError(STORAGE_ERRORS.REVISION_CONFLICT, `Revision mismatch: ${path}`)
      }
      throw error
    }
  }

  async downloadFile(path) {
    const fullPath = this._getFullPath(path)
    return await this._apiCall('/files/download', { path: fullPath }, true)
  }

  async uploadFile(path, file) {
    const fullPath = this._getFullPath(path)

    // Ensure parent folder exists
    const parts = path.split('/')
    parts.pop()
    if (parts.length > 0) {
      await this.createFolder(parts.join('/'))
    }

    const result = await this._apiCall(
      '/files/upload',
      { path: fullPath, mode: { '.tag': 'overwrite' }, _content: file },
      true
    )

    return result.id
  }

  async deleteFile(path) {
    const fullPath = this._getFullPath(path)
    await this._apiCall('/files/delete_v2', { path: fullPath })
  }

  async getMetadata(path) {
    const fullPath = this._getFullPath(path)
    const result = await this._apiCall('/files/get_metadata', { path: fullPath })
    return this._normalizeMetadata(result)
  }

  _normalizeMetadata(item) {
    return {
      id: item.id || item.path_display,
      path: item.path_display,
      name: item.name,
      type: item['.tag'] === 'folder' ? 'folder' : 'file',
      size: item.size,
      modified: item.server_modified,
      revision: item.rev || null,
    }
  }

  async getFileStreamURL(fileIdOrPath) {
    // Dropbox uses paths, but we store path in box_path field
    // For compatibility, accept both path and ID
    const path = fileIdOrPath.startsWith('/') ? fileIdOrPath : this._getFullPath(fileIdOrPath)

    const result = await this._apiCall('/files/get_temporary_link', { path })
    return result.link
  }

  async listFolder(path) {
    const fullPath = this._getFullPath(path)
    let result = await this._apiCall('/files/list_folder', { path: fullPath })
    let allEntries = [...result.entries]

    while (result.has_more) {
      result = await this._apiCall('/files/list_folder/continue', { cursor: result.cursor })
      allEntries.push(...result.entries)
    }

    return allEntries.map((item) => this._normalizeMetadata(item))
  }

  async createFolder(path) {
    const fullPath = this._getFullPath(path)
    try {
      await this._apiCall('/files/get_metadata', { path: fullPath })
      return fullPath
    } catch (e) {
      if (e.code === STORAGE_ERRORS.NOT_FOUND) {
        const result = await this._apiCall('/files/create_folder_v2', { path: fullPath })
        return result.metadata.id
      }
      throw e
    }
  }
}
