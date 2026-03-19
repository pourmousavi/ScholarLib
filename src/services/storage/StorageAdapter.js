/**
 * StorageAdapter Interface
 * Abstract interface for cloud storage providers (Box, Dropbox).
 * All methods are async and throw errors with { code, message } shape.
 *
 * Error codes:
 * - STORAGE_NOT_CONNECTED: No valid auth tokens
 * - STORAGE_AUTH_EXPIRED: Tokens expired and refresh failed
 * - STORAGE_NOT_FOUND: File/folder not found
 * - STORAGE_PERMISSION_DENIED: Access denied
 * - STORAGE_RATE_LIMITED: Too many requests
 * - STORAGE_NETWORK_ERROR: Network failure
 */

/**
 * @typedef {Object} StorageAdapter
 *
 * @property {function(): Promise<boolean>} isConnected
 * Check if storage is connected and tokens are valid.
 * @returns {Promise<boolean>}
 *
 * @property {function(): void} connect
 * Initiate OAuth flow. Redirects to provider's auth page.
 *
 * @property {function(string): Promise<void>} handleCallback
 * Handle OAuth callback with authorization code.
 * @param {string} code - The authorization code from OAuth callback
 *
 * @property {function(): Promise<void>} disconnect
 * Clear stored tokens and disconnect.
 *
 * @property {function(): Promise<void>} refreshTokenIfNeeded
 * Silently refresh access token if expired.
 *
 * @property {function(string): Promise<Object>} readJSON
 * Read and parse a JSON file from storage.
 * @param {string} path - Relative path within ScholarLib folder
 * @returns {Promise<Object>} Parsed JSON content
 *
 * @property {function(string, Object): Promise<void>} writeJSON
 * Write an object as JSON to storage.
 * @param {string} path - Relative path within ScholarLib folder
 * @param {Object} data - Data to serialize as JSON
 *
 * @property {function(string): Promise<Blob>} downloadFile
 * Download a file as Blob.
 * @param {string} path - Relative path within ScholarLib folder
 * @returns {Promise<Blob>} File content as Blob
 *
 * @property {function(string, Blob|File): Promise<string>} uploadFile
 * Upload a file to storage.
 * @param {string} path - Relative path within ScholarLib folder
 * @param {Blob|File} file - File content to upload
 * @returns {Promise<string>} File ID in storage
 *
 * @property {function(string): Promise<void>} deleteFile
 * Delete a file from storage.
 * @param {string} path - Relative path within ScholarLib folder
 *
 * @property {function(string): Promise<string>} getFileStreamURL
 * Get a temporary streaming URL for a file (for PDF viewer).
 * @param {string} fileId - File ID in storage
 * @returns {Promise<string>} Pre-signed URL valid for ~60 seconds
 *
 * @property {function(string): Promise<Array>} listFolder
 * List contents of a folder.
 * @param {string} path - Relative path within ScholarLib folder
 * @returns {Promise<Array>} Array of { name, type, id, size, modified }
 *
 * @property {function(string): Promise<string>} createFolder
 * Create a folder (creates parent folders if needed).
 * @param {string} path - Relative path within ScholarLib folder
 * @returns {Promise<string>} Folder ID
 *
 * @property {function(): string} getProviderName
 * Get the storage provider name.
 * @returns {string} 'box' or 'dropbox'
 */

export class StorageError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = 'StorageError'
  }
}

export const STORAGE_ERRORS = {
  NOT_CONNECTED: 'STORAGE_NOT_CONNECTED',
  AUTH_EXPIRED: 'STORAGE_AUTH_EXPIRED',
  NOT_FOUND: 'STORAGE_NOT_FOUND',
  PERMISSION_DENIED: 'STORAGE_PERMISSION_DENIED',
  RATE_LIMITED: 'STORAGE_RATE_LIMITED',
  NETWORK_ERROR: 'STORAGE_NETWORK_ERROR',
}
