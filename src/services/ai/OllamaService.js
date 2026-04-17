/**
 * OllamaService - Local AI via Ollama
 *
 * Requires Ollama running locally: ollama serve
 * Default endpoint: http://localhost:11434
 *
 * IMPORTANT: Ollama must be started with CORS enabled:
 *   OLLAMA_ORIGINS="*" ollama serve
 */
class OllamaService {
  constructor() {
    this.baseURL = 'http://localhost:11434'
    this.lastError = null
    this.lastCheckTime = 0
    this.cachedAvailability = null
    this.cacheExpiry = 5000 // Cache result for 5 seconds to avoid hammering
  }

  /**
   * Check if Ollama is available
   * Uses caching to avoid repeated checks
   * @param {boolean} forceCheck - Bypass cache and check immediately
   * @returns {Promise<boolean>}
   */
  async isAvailable(forceCheck = false) {
    // Return cached result if recent
    const now = Date.now()
    if (!forceCheck && this.cachedAvailability !== null && (now - this.lastCheckTime) < this.cacheExpiry) {
      return this.cachedAvailability
    }

    // Try the check with retry
    const result = await this._checkWithRetry()
    this.cachedAvailability = result
    this.lastCheckTime = now
    return result
  }

  /**
   * Internal check with retry logic
   * @returns {Promise<boolean>}
   */
  async _checkWithRetry() {
    // Try up to 2 times with different approaches
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

        const res = await fetch(`${this.baseURL}/api/tags`, {
          method: 'GET',
          signal: controller.signal,
          // Don't set mode: 'cors' explicitly - let browser handle it
          // This allows the request to work in more scenarios
        })

        clearTimeout(timeoutId)

        if (res.ok) {
          this.lastError = null
          return true
        }

        // Non-OK response
        this.lastError = `Ollama returned status ${res.status}`
        return false
      } catch (err) {
        // Categorize the error for better debugging
        if (err.name === 'AbortError') {
          this.lastError = 'Connection timeout - Ollama may not be running'
        } else if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
          // This usually means CORS blocked or network error
          this.lastError = 'Cannot reach Ollama - check CORS settings'
        } else if (err.message?.includes('NetworkError')) {
          this.lastError = 'Network error - is Ollama running?'
        } else {
          this.lastError = err.message || 'Unknown error connecting to Ollama'
        }

        // Small delay before retry
        if (attempt < 1) {
          await new Promise(r => setTimeout(r, 500))
        }
      }
    }

    return false
  }

  /**
   * Get the last error message (useful for UI)
   * @returns {string|null}
   */
  getLastError() {
    return this.lastError
  }

  /**
   * Clear cached availability (force re-check on next call)
   */
  clearCache() {
    this.cachedAvailability = null
    this.lastCheckTime = 0
  }

  /**
   * Get list of available models
   * @returns {Promise<Array>}
   */
  async getModels() {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const res = await fetch(`${this.baseURL}/api/tags`, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!res.ok) return []
      const data = await res.json()
      return data.models || []
    } catch (err) {
      console.warn('[OllamaService] Failed to get models:', err.message)
      return []
    }
  }

  /**
   * Stream chat completion
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {string} model - Model name (default: llama3.2)
   * @yields {string} Content chunks
   */
  async *streamChat(messages, model = 'llama3.2') {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true
      })
    })

    if (!res.ok) {
      const error = await res.text()
      throw { code: 'OLLAMA_ERROR', message: error || 'Ollama request failed' }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          if (data.message?.content) {
            yield data.message.content
          }
          if (data.done) {
            return
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }

  /**
   * Non-streaming chat completion
   * @param {Array} messages - Chat messages
   * @param {string} model - Model name
   * @returns {Promise<string>}
   */
  async chat(messages, model = 'llama3.2') {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false
      })
    })

    if (!res.ok) {
      throw { code: 'OLLAMA_ERROR', message: 'Ollama request failed' }
    }

    const data = await res.json()
    return data.message?.content || ''
  }

  /**
   * Generate embeddings
   * @param {string} text - Text to embed
   * @param {string} model - Embedding model (default: nomic-embed-text)
   * @returns {Promise<number[]>}
   */
  async embed(text, model = 'nomic-embed-text') {
    const res = await fetch(`${this.baseURL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: text
      })
    })

    if (!res.ok) {
      throw { code: 'OLLAMA_EMBED_ERROR', message: 'Failed to generate embeddings' }
    }

    const data = await res.json()
    return data.embedding
  }

  /**
   * Pull (download) a model from Ollama registry
   * @param {string} modelName - Model name to pull (e.g., 'llama3.2:1b')
   * @param {function} onProgress - Progress callback
   * @returns {Promise<void>}
   */
  async pullModel(modelName, onProgress = () => {}) {
    const res = await fetch(`${this.baseURL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: modelName,
        stream: true
      })
    })

    if (!res.ok) {
      const error = await res.text()
      throw { code: 'OLLAMA_PULL_ERROR', message: error || 'Failed to pull model' }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const data = JSON.parse(line)

          // Calculate progress percentage
          let progress = 0
          if (data.total && data.completed) {
            progress = (data.completed / data.total) * 100
          }

          onProgress({
            status: data.status || 'downloading',
            progress,
            completed: data.completed || 0,
            total: data.total || 0,
            digest: data.digest
          })

          if (data.status === 'success') {
            return
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }

  /**
   * Get list of popular models with metadata
   * @returns {Array} Popular models with size/RAM/quality info
   */
  getPopularModels() {
    return [
      {
        id: 'llama3.2:1b',
        name: 'Llama 3.2 1B',
        size: '1.3 GB',
        ram: '4 GB',
        quality: 'basic',
        description: 'Smallest model, good for quick responses'
      },
      {
        id: 'llama3.2',
        name: 'Llama 3.2 3B',
        size: '2.0 GB',
        ram: '6 GB',
        quality: 'basic',
        description: 'Balanced speed and quality for most tasks'
      },
      {
        id: 'llama3.1:8b',
        name: 'Llama 3.1 8B',
        size: '4.7 GB',
        ram: '10 GB',
        quality: 'good',
        description: 'Recommended for research tasks'
      },
      {
        id: 'mistral',
        name: 'Mistral 7B',
        size: '4.1 GB',
        ram: '10 GB',
        quality: 'good',
        description: 'Fast and capable for general use'
      },
      {
        id: 'gemma3:4b',
        name: 'Gemma 3 4B',
        size: '3.3 GB',
        ram: '6 GB',
        quality: 'good',
        description: 'Google Gemma 3, fast and efficient'
      },
      {
        id: 'gemma3:12b',
        name: 'Gemma 3 12B',
        size: '8.1 GB',
        ram: '12 GB',
        quality: 'good',
        description: 'Google Gemma 3, recommended for research'
      },
      {
        id: 'llama3.1:70b',
        name: 'Llama 3.1 70B',
        size: '40 GB',
        ram: '64 GB',
        quality: 'excellent',
        description: 'Best quality, requires powerful hardware'
      },
      {
        id: 'nomic-embed-text',
        name: 'Nomic Embed',
        size: '274 MB',
        ram: '2 GB',
        quality: 'n/a',
        description: 'Required for document indexing'
      }
    ]
  }
}

export const ollamaService = new OllamaService()
