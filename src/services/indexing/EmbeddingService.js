/**
 * EmbeddingService - Generate embeddings for text chunks
 *
 * Routes to appropriate embedding provider based on AI settings
 */
import { useAIStore } from '../../store/aiStore'
import { ollamaService } from '../ai/OllamaService'

class EmbeddingService {
  constructor() {
    this.dimensions = 768 // nomic-embed-text dimensions
    this.modelName = 'nomic-embed-text'
  }

  /**
   * Generate embedding for text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text) {
    const { provider } = useAIStore.getState()

    // Truncate very long text (embedding models have limits)
    const truncatedText = text.slice(0, 8000)

    if (provider === 'ollama') {
      return await this.embedWithOllama(truncatedText)
    }

    // For cloud providers and WebLLM, fall back to Ollama if available
    // In production, we'd use OpenAI's text-embedding-ada-002 or similar
    const ollamaAvailable = await ollamaService.isAvailable()
    if (ollamaAvailable) {
      return await this.embedWithOllama(truncatedText)
    }

    throw {
      code: 'EMBEDDING_NOT_AVAILABLE',
      message: 'Ollama is required for generating embeddings. Please start Ollama with: ollama serve'
    }
  }

  /**
   * Generate embedding using Ollama
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedWithOllama(text) {
    try {
      const embedding = await ollamaService.embed(text, this.modelName)
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response')
      }
      return embedding
    } catch (error) {
      // If nomic-embed-text not available, try to pull it
      if (error.message?.includes('not found')) {
        throw {
          code: 'EMBEDDING_MODEL_NOT_FOUND',
          message: 'Embedding model not found. Run: ollama pull nomic-embed-text'
        }
      }
      throw error
    }
  }

  /**
   * Generate embeddings for multiple texts (batched)
   * @param {string[]} texts - Texts to embed
   * @param {Function} onProgress - Progress callback (current, total)
   * @returns {Promise<number[][]>}
   */
  async embedBatch(texts, onProgress) {
    const embeddings = []

    for (let i = 0; i < texts.length; i++) {
      const embedding = await this.embed(texts[i])
      embeddings.push(embedding)
      onProgress?.(i + 1, texts.length)
    }

    return embeddings
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {number[]} a
   * @param {number[]} b
   * @returns {number}
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) {
      return 0
    }

    let dot = 0
    let magA = 0
    let magB = 0

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }

    magA = Math.sqrt(magA)
    magB = Math.sqrt(magB)

    if (magA === 0 || magB === 0) {
      return 0
    }

    return dot / (magA * magB)
  }

  /**
   * Get embedding dimensions
   * @returns {number}
   */
  getDimensions() {
    return this.dimensions
  }
}

export const embeddingService = new EmbeddingService()
