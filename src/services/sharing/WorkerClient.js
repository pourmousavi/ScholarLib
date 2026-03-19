/**
 * WorkerClient - Client for ScholarLib Cloudflare Worker API
 *
 * Handles communication with the Worker for:
 * - Share management
 * - Access control
 * - Activity logging
 */
class WorkerClient {
  /**
   * Get the Worker base URL from environment
   */
  get baseURL() {
    return import.meta.env.VITE_WORKER_URL || ''
  }

  /**
   * Check if Worker is configured
   */
  isConfigured() {
    return !!this.baseURL
  }

  /**
   * Create a new share
   * @param {string} folderPath - Path to the folder being shared
   * @param {string} email - Collaborator's email
   * @param {string} permission - Permission level (viewer, annotator, contributor)
   * @param {string} boxToken - User's Box access token for authorization
   * @param {string} [expiresAt] - Optional expiration date
   * @returns {Promise<object>}
   */
  async createShare(folderPath, email, permission, boxToken, expiresAt = null) {
    return this.post('/share', {
      folder_path: folderPath,
      collaborator_email: email,
      permission,
      expires_at: expiresAt
    }, boxToken)
  }

  /**
   * Delete a share
   * @param {string} shareId - ID of the share to delete
   * @param {string} boxToken - User's Box access token for authorization
   * @returns {Promise<object>}
   */
  async deleteShare(shareId, boxToken) {
    return this.delete(`/share/${shareId}`, boxToken)
  }

  /**
   * Get all collaborators for a folder
   * @param {string} folderPath - Path to the folder
   * @returns {Promise<object>}
   */
  async getAccess(folderPath) {
    return this.get(`/access/${encodeURIComponent(folderPath)}`)
  }

  /**
   * Log an access event
   * @param {string} action - Action type (view, download, annotate, upload)
   * @param {string} docId - Document ID (optional)
   * @param {string} folderPath - Folder path
   * @param {string} email - Collaborator's email
   * @returns {Promise<object>}
   */
  async logAccess(action, docId, folderPath, email) {
    return this.post('/log', {
      action,
      doc_id: docId,
      folder_path: folderPath,
      collaborator_email: email
    })
  }

  /**
   * Get activity log for a folder
   * @param {string} folderPath - Path to the folder
   * @param {string} [since] - ISO date string to filter events after
   * @param {number} [limit] - Maximum number of events to return
   * @returns {Promise<object>}
   */
  async getActivity(folderPath, since = null, limit = 50) {
    let url = `/activity/${encodeURIComponent(folderPath)}`
    const params = []
    if (since) params.push(`since=${encodeURIComponent(since)}`)
    if (limit) params.push(`limit=${limit}`)
    if (params.length) url += `?${params.join('&')}`
    return this.get(url)
  }

  /**
   * Validate user access to a folder
   * @param {string} email - User's email
   * @param {string} folderPath - Folder path
   * @returns {Promise<object>}
   */
  async validateAccess(email, folderPath) {
    return this.post('/token', {
      email,
      folder_path: folderPath
    })
  }

  /**
   * Quick check if user has access
   * @param {string} email - User's email
   * @param {string} folderPath - Folder path
   * @returns {Promise<object>}
   */
  async checkAccess(email, folderPath) {
    return this.post('/check-access', {
      email,
      folder_path: folderPath
    })
  }

  /**
   * Health check
   * @returns {Promise<object>}
   */
  async healthCheck() {
    return this.get('/health')
  }

  /**
   * Make a POST request
   * @private
   */
  async post(path, body, authToken = null) {
    if (!this.baseURL) {
      throw new Error('Worker URL not configured')
    }

    const headers = {
      'Content-Type': 'application/json'
    }

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }

    try {
      const response = await fetch(this.baseURL + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`)
      }

      return data
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to sharing service')
      }
      throw error
    }
  }

  /**
   * Make a DELETE request
   * @private
   */
  async delete(path, authToken = null) {
    if (!this.baseURL) {
      throw new Error('Worker URL not configured')
    }

    const headers = {}

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
    }

    try {
      const response = await fetch(this.baseURL + path, {
        method: 'DELETE',
        headers
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`)
      }

      return data
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to sharing service')
      }
      throw error
    }
  }

  /**
   * Make a GET request
   * @private
   */
  async get(path) {
    if (!this.baseURL) {
      throw new Error('Worker URL not configured')
    }

    try {
      const response = await fetch(this.baseURL + path)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`)
      }

      return data
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to sharing service')
      }
      throw error
    }
  }
}

export const workerClient = new WorkerClient()
