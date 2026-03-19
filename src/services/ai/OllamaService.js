/**
 * OllamaService - Local AI via Ollama
 *
 * Requires Ollama running locally: ollama serve
 * Default endpoint: http://localhost:11434
 */
class OllamaService {
  constructor() {
    this.baseURL = 'http://localhost:11434'
  }

  /**
   * Check if Ollama is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const res = await fetch(`${this.baseURL}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  /**
   * Get list of available models
   * @returns {Promise<Array>}
   */
  async getModels() {
    try {
      const res = await fetch(`${this.baseURL}/api/tags`)
      if (!res.ok) return []
      const data = await res.json()
      return data.models || []
    } catch {
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
}

export const ollamaService = new OllamaService()
