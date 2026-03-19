import axios from 'axios'
import { StorageError, STORAGE_ERRORS } from './StorageAdapter'

const BOX_API_BASE = 'https://api.box.com/2.0'
const BOX_UPLOAD_BASE = 'https://upload.box.com/api/2.0'
const BOX_AUTH_URL = 'https://account.box.com/api/oauth2/authorize'
const BOX_TOKEN_URL = 'https://api.box.com/oauth2/token'

// PKCE helpers
async function sha256(plain) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return hash
}

function base64URLEncode(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function generateCodeVerifier() {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

async function generateCodeChallenge(verifier) {
  const hash = await sha256(verifier)
  return base64URLEncode(hash)
}

function generateState() {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return base64URLEncode(array)
}

export class BoxAdapter {
  constructor() {
    this.rootFolderId = localStorage.getItem('sv_box_root_id') || null
    this.axiosInstance = axios.create({
      baseURL: BOX_API_BASE,
    })

    // Add auth interceptor
    this.axiosInstance.interceptors.request.use(async (config) => {
      await this.refreshTokenIfNeeded()
      const token = this._getAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })

    // Add retry interceptor for rate limiting
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 5
          await new Promise((r) => setTimeout(r, retryAfter * 1000))
          return this.axiosInstance.request(error.config)
        }
        throw error
      }
    )
  }

  getProviderName() {
    return 'box'
  }

  // Token management
  _getAccessToken() {
    const encoded = localStorage.getItem('sv_box_access')
    return encoded ? atob(encoded) : null
  }

  _getRefreshToken() {
    const encoded = localStorage.getItem('sv_box_refresh')
    return encoded ? atob(encoded) : null
  }

  _getExpiry() {
    return parseInt(localStorage.getItem('sv_box_expiry') || '0', 10)
  }

  _storeTokens(accessToken, refreshToken, expiresIn) {
    const expiry = Date.now() + expiresIn * 1000
    localStorage.setItem('sv_box_access', btoa(accessToken))
    localStorage.setItem('sv_box_refresh', btoa(refreshToken))
    localStorage.setItem('sv_box_expiry', expiry.toString())
  }

  _clearTokens() {
    localStorage.removeItem('sv_box_access')
    localStorage.removeItem('sv_box_refresh')
    localStorage.removeItem('sv_box_expiry')
    localStorage.removeItem('sv_box_root_id')
    this.rootFolderId = null
  }

  async isConnected() {
    const token = this._getAccessToken()
    if (!token) return false

    try {
      await this.refreshTokenIfNeeded()
      // Verify token works
      await this.axiosInstance.get('/users/me')
      return true
    } catch {
      return false
    }
  }

  connect() {
    const clientId = import.meta.env.VITE_BOX_CLIENT_ID
    const redirectUri = import.meta.env.VITE_BOX_REDIRECT_URI

    if (!clientId || !redirectUri) {
      throw new StorageError(
        STORAGE_ERRORS.NOT_CONNECTED,
        'Box app not configured. Set VITE_BOX_CLIENT_ID and VITE_BOX_REDIRECT_URI in .env.local'
      )
    }

    const verifier = generateCodeVerifier()
    sessionStorage.setItem('pkce_verifier', verifier)
    const state = generateState()
    sessionStorage.setItem('oauth_state', state)

    generateCodeChallenge(verifier).then((challenge) => {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: state,
      })
      window.location.href = `${BOX_AUTH_URL}?${params}`
    })
  }

  async handleCallback(code, state) {
    // Verify state
    const savedState = sessionStorage.getItem('oauth_state')
    if (state && state !== savedState) {
      throw new StorageError(STORAGE_ERRORS.NOT_CONNECTED, 'OAuth state mismatch')
    }

    const verifier = sessionStorage.getItem('pkce_verifier')
    if (!verifier) {
      throw new StorageError(STORAGE_ERRORS.NOT_CONNECTED, 'PKCE verifier not found')
    }

    const clientId = import.meta.env.VITE_BOX_CLIENT_ID
    const redirectUri = import.meta.env.VITE_BOX_REDIRECT_URI

    const response = await fetch(BOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        code_verifier: verifier,
        redirect_uri: redirectUri,
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
    this._storeTokens(access_token, refresh_token, expires_in)

    // Clean up
    sessionStorage.removeItem('pkce_verifier')
    sessionStorage.removeItem('oauth_state')

    // Find or create ScholarLib root folder
    await this._ensureRootFolder()
  }

  async disconnect() {
    this._clearTokens()
  }

  async refreshTokenIfNeeded() {
    const expiry = this._getExpiry()
    // 5 minute buffer
    if (Date.now() < expiry - 300000) return

    const refreshToken = this._getRefreshToken()
    if (!refreshToken) {
      throw new StorageError(STORAGE_ERRORS.AUTH_EXPIRED, 'No refresh token available')
    }

    const clientId = import.meta.env.VITE_BOX_CLIENT_ID

    const response = await fetch(BOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    })

    if (!response.ok) {
      this._clearTokens()
      throw new StorageError(STORAGE_ERRORS.AUTH_EXPIRED, 'Token refresh failed')
    }

    const { access_token, refresh_token, expires_in } = await response.json()
    this._storeTokens(access_token, refresh_token, expires_in)
  }

  async _ensureRootFolder() {
    if (this.rootFolderId) return this.rootFolderId

    // Search for existing ScholarLib folder in root (folder_id 0)
    const searchResponse = await this.axiosInstance.get('/folders/0/items', {
      params: { fields: 'id,name,type', limit: 1000 },
    })

    const existing = searchResponse.data.entries.find(
      (item) => item.type === 'folder' && item.name === 'ScholarLib'
    )

    if (existing) {
      this.rootFolderId = existing.id
      localStorage.setItem('sv_box_root_id', existing.id)
      return existing.id
    }

    // Create new ScholarLib folder
    const createResponse = await this.axiosInstance.post('/folders', {
      name: 'ScholarLib',
      parent: { id: '0' },
    })

    this.rootFolderId = createResponse.data.id
    localStorage.setItem('sv_box_root_id', createResponse.data.id)

    // Create _system subfolder
    await this.createFolder('_system')
    await this.createFolder('_system/index')
    await this.createFolder('PDFs')

    return this.rootFolderId
  }

  async _getPathFolderId(path) {
    await this._ensureRootFolder()

    if (!path || path === '/') return this.rootFolderId

    const parts = path.split('/').filter(Boolean)
    let currentId = this.rootFolderId

    for (const part of parts) {
      const response = await this.axiosInstance.get(`/folders/${currentId}/items`, {
        params: { fields: 'id,name,type', limit: 1000 },
      })

      const folder = response.data.entries.find(
        (item) => item.type === 'folder' && item.name === part
      )

      if (!folder) {
        throw new StorageError(STORAGE_ERRORS.NOT_FOUND, `Folder not found: ${path}`)
      }

      currentId = folder.id
    }

    return currentId
  }

  async _getFileId(path) {
    const parts = path.split('/')
    const fileName = parts.pop()
    const folderPath = parts.join('/')

    const folderId = await this._getPathFolderId(folderPath)

    const response = await this.axiosInstance.get(`/folders/${folderId}/items`, {
      params: { fields: 'id,name,type', limit: 1000 },
    })

    const file = response.data.entries.find(
      (item) => item.type === 'file' && item.name === fileName
    )

    if (!file) {
      throw new StorageError(STORAGE_ERRORS.NOT_FOUND, `File not found: ${path}`)
    }

    return file.id
  }

  async readJSON(path) {
    const fileId = await this._getFileId(path)
    const response = await this.axiosInstance.get(`/files/${fileId}/content`, {
      responseType: 'text',
    })
    return JSON.parse(response.data)
  }

  async writeJSON(path, data) {
    const content = JSON.stringify(data, null, 2)
    const blob = new Blob([content], { type: 'application/json' })

    try {
      // Try to update existing file
      const fileId = await this._getFileId(path)
      await axios.post(
        `${BOX_UPLOAD_BASE}/files/${fileId}/content`,
        blob,
        {
          headers: {
            Authorization: `Bearer ${this._getAccessToken()}`,
            'Content-Type': 'application/octet-stream',
          },
        }
      )
    } catch (e) {
      if (e.code === STORAGE_ERRORS.NOT_FOUND) {
        // Create new file
        await this.uploadFile(path, blob)
      } else {
        throw e
      }
    }
  }

  async downloadFile(path) {
    const fileId = await this._getFileId(path)
    const response = await this.axiosInstance.get(`/files/${fileId}/content`, {
      responseType: 'blob',
    })
    return response.data
  }

  async uploadFile(path, file) {
    const parts = path.split('/')
    const fileName = parts.pop()
    const folderPath = parts.join('/')

    // Ensure folder exists
    let folderId
    try {
      folderId = await this._getPathFolderId(folderPath)
    } catch {
      folderId = await this.createFolder(folderPath)
    }

    const formData = new FormData()
    formData.append('attributes', JSON.stringify({
      name: fileName,
      parent: { id: folderId },
    }))
    formData.append('file', file, fileName)

    const response = await axios.post(
      `${BOX_UPLOAD_BASE}/files/content`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${this._getAccessToken()}`,
        },
      }
    )

    return response.data.entries[0].id
  }

  async deleteFile(path) {
    const fileId = await this._getFileId(path)
    await this.axiosInstance.delete(`/files/${fileId}`)
  }

  async getFileStreamURL(fileId) {
    // Box returns a redirect to a pre-signed S3 URL
    const response = await this.axiosInstance.get(`/files/${fileId}/content`, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302,
    })
    return response.headers.location
  }

  async listFolder(path) {
    const folderId = await this._getPathFolderId(path)
    const response = await this.axiosInstance.get(`/folders/${folderId}/items`, {
      params: { fields: 'id,name,type,size,modified_at', limit: 1000 },
    })

    return response.data.entries.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      size: item.size,
      modified: item.modified_at,
    }))
  }

  async createFolder(path) {
    await this._ensureRootFolder()

    const parts = path.split('/').filter(Boolean)
    let currentId = this.rootFolderId

    for (const part of parts) {
      // Check if folder exists
      const response = await this.axiosInstance.get(`/folders/${currentId}/items`, {
        params: { fields: 'id,name,type', limit: 1000 },
      })

      const existing = response.data.entries.find(
        (item) => item.type === 'folder' && item.name === part
      )

      if (existing) {
        currentId = existing.id
      } else {
        // Create folder
        const createResponse = await this.axiosInstance.post('/folders', {
          name: part,
          parent: { id: currentId },
        })
        currentId = createResponse.data.id
      }
    }

    return currentId
  }
}
