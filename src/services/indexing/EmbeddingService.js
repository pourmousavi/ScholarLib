/**
 * EmbeddingService - Generate embeddings for text chunks
 *
 * Routes to appropriate embedding provider:
 * 1. Ollama (if available) - fastest for local
 * 2. Browser transformers.js - works everywhere, no server needed
 */
import { useAIStore } from '../../store/aiStore'
import { ollamaService } from '../ai/OllamaService'
import { pipeline, env } from '@xenova/transformers'

// Configure transformers.js to use browser cache
env.useBrowserCache = true
env.allowLocalModels = false

class EmbeddingService {
  constructor() {
    this.dimensions = 384 // all-MiniLM-L6-v2 dimensions
    this.modelName = 'Xenova/all-MiniLM-L6-v2'
    this.extractor = null
    this.isInitializing = false
    this.initPromise = null
  }

  /**
   * Initialize the browser embedding model
   * @param {Function} onProgress - Progress callback
   */
  async initBrowserModel(onProgress) {
    if (this.extractor) return this.extractor

    if (this.isInitializing) {
      return this.initPromise
    }

    this.isInitializing = true
    this.initPromise = (async () => {
      try {
        console.log('Loading browser embedding model...')
        this.extractor = await pipeline('feature-extraction', this.modelName, {
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              onProgress?.({
                progress: progress.progress / 100,
                text: `Loading embedding model: ${Math.round(progress.progress)}%`
              })
            }
          }
        })
        console.log('Browser embedding model loaded')
        return this.extractor
      } catch (error) {
        console.error('Failed to load browser embedding model:', error)
        throw error
      } finally {
        this.isInitializing = false
      }
    })()

    return this.initPromise
  }

  /**
   * Generate embedding for text
   * @param {string} text - Text to embed
   * @param {Function} onProgress - Progress callback for model loading
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text, onProgress) {
    const { provider } = useAIStore.getState()

    // Truncate very long text (embedding models have limits)
    const truncatedText = text.slice(0, 8000)

    // Always try Ollama first for embeddings (regardless of chat provider)
    // This ensures consistency between indexing and search
    try {
      const ollamaAvailable = await ollamaService.isAvailable()
      console.log('[EmbeddingService] Ollama available:', ollamaAvailable, 'provider:', provider)
      if (ollamaAvailable) {
        const embedding = await this.embedWithOllama(truncatedText)
        console.log('[EmbeddingService] Using Ollama embeddings, dimensions:', embedding.length)
        return embedding
      }
    } catch (error) {
      console.log('[EmbeddingService] Ollama embedding failed:', error.message)
    }

    // Use browser-based embeddings as fallback
    console.log('[EmbeddingService] Using browser embeddings (fallback)')
    const embedding = await this.embedWithBrowser(truncatedText, onProgress)
    console.log('[EmbeddingService] Browser embedding dimensions:', embedding.length)
    return embedding
  }

  /**
   * Generate embedding using Ollama
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedWithOllama(text) {
    try {
      const embedding = await ollamaService.embed(text, 'nomic-embed-text')
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response')
      }
      // Update dimensions if different
      this.dimensions = embedding.length
      return embedding
    } catch (error) {
      // If nomic-embed-text not available, throw with helpful message
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
   * Generate embedding using browser transformers.js
   * @param {string} text
   * @param {Function} onProgress
   * @returns {Promise<number[]>}
   */
  async embedWithBrowser(text, onProgress) {
    // Initialize model if needed
    const extractor = await this.initBrowserModel(onProgress)

    // Generate embedding
    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true
    })

    // Convert to array
    const embedding = Array.from(output.data)
    this.dimensions = embedding.length
    return embedding
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

  /**
   * Check if browser embedding model is loaded
   * @returns {boolean}
   */
  isBrowserModelLoaded() {
    return this.extractor !== null
  }
}

export const embeddingService = new EmbeddingService()
