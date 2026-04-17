/**
 * EmbeddingService - Generate embeddings for text chunks
 *
 * Routes to the user-configured embedding provider:
 * 1. Gemini API (text-embedding-004, 768-dim) - recommended, free tier
 * 2. OpenAI API (text-embedding-3-small, 1536-dim) - high quality
 * 3. Ollama (nomic-embed-text, 768-dim) - local, free
 * 4. Browser transformers.js (all-MiniLM-L6-v2, 384-dim) - fallback
 */
import { useAIStore } from '../../store/aiStore'
import { ollamaService } from '../ai/OllamaService'
import { geminiService } from '../ai/GeminiService'
import { openaiService } from '../ai/OpenAIService'
import { pipeline, env } from '@xenova/transformers'

// Configure transformers.js to use browser cache
env.useBrowserCache = true
env.allowLocalModels = false

class EmbeddingService {
  constructor() {
    this.dimensions = 384 // default for browser model
    this.modelName = 'all-MiniLM-L6-v2'
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
        this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
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
   * Generate embedding for text using the configured provider
   * @param {string} text - Text to embed
   * @param {Function} onProgress - Progress callback for model loading
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text, onProgress) {
    const { embeddingProvider } = useAIStore.getState()

    // Truncate very long text (embedding models have limits)
    const truncatedText = text.slice(0, 8000)

    switch (embeddingProvider) {
      case 'gemini':
        return await this.embedWithGemini(truncatedText)
      case 'openai':
        return await this.embedWithOpenAI(truncatedText)
      case 'ollama':
        return await this.embedWithOllama(truncatedText)
      case 'browser':
      default:
        return await this.embedWithBrowser(truncatedText, onProgress)
    }
  }

  /**
   * Generate embedding using Gemini API (gemini-embedding-001)
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedWithGemini(text) {
    const results = await this.embedBatchWithGemini([text])
    return results[0]
  }

  /**
   * Batch embed multiple texts with Gemini API (up to 100 per call)
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embedBatchWithGemini(texts) {
    const apiKey = geminiService.getApiKey()
    if (!apiKey) {
      throw new Error('Gemini API key not configured')
    }

    const allEmbeddings = []
    const batchSize = 100

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: batch.map(t => ({
              model: 'models/gemini-embedding-001',
              content: { parts: [{ text: t.slice(0, 8000) }] }
            }))
          })
        }
      )

      if (!res.ok) {
        let msg = 'Gemini embedding request failed'
        try {
          const err = await res.json()
          msg = err.error?.message || msg
        } catch { /* ignore */ }
        throw new Error(msg)
      }

      const data = await res.json()
      const embeddings = data.embeddings
      if (!embeddings || !Array.isArray(embeddings)) {
        throw new Error('Invalid Gemini batch embedding response')
      }

      for (const emb of embeddings) {
        allEmbeddings.push(emb.values)
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < texts.length) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    if (allEmbeddings.length > 0) {
      this.dimensions = allEmbeddings[0].length
      this.modelName = 'gemini-embedding-001'
      console.log(`[EmbeddingService] Gemini batch embedding: ${allEmbeddings.length} texts, ${this.dimensions} dimensions`)
    }

    return allEmbeddings
  }

  /**
   * Generate embedding using OpenAI API (text-embedding-3-small, 1536-dim)
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedWithOpenAI(text) {
    const results = await this.embedBatchWithOpenAI([text])
    return results[0]
  }

  /**
   * Batch embed multiple texts with OpenAI API
   * @param {string[]} texts
   * @returns {Promise<number[][]>}
   */
  async embedBatchWithOpenAI(texts) {
    const apiKey = openaiService.getApiKey()
    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts.map(t => t.slice(0, 8000))
      })
    })

    if (!res.ok) {
      let msg = 'OpenAI embedding request failed'
      try {
        const err = await res.json()
        msg = err.error?.message || msg
      } catch { /* ignore */ }
      throw new Error(msg)
    }

    const data = await res.json()
    const embeddings = (data.data || [])
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding)

    if (embeddings.length > 0) {
      this.dimensions = embeddings[0].length
      this.modelName = 'text-embedding-3-small'
      console.log(`[EmbeddingService] OpenAI batch embedding: ${embeddings.length} texts, ${this.dimensions} dimensions`)
    }

    return embeddings
  }

  /**
   * Generate embedding using Ollama (nomic-embed-text, 768-dim)
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedWithOllama(text) {
    try {
      const embedding = await ollamaService.embed(text, 'nomic-embed-text')
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response')
      }
      this.dimensions = embedding.length
      this.modelName = 'nomic-embed-text'
      console.log('[EmbeddingService] Ollama embedding, dimensions:', embedding.length)
      return embedding
    } catch (error) {
      if (error.message?.includes('not found')) {
        throw new Error('Embedding model not found. Run: ollama pull nomic-embed-text')
      }
      throw error
    }
  }

  /**
   * Generate embedding using browser transformers.js (all-MiniLM-L6-v2, 384-dim)
   * @param {string} text
   * @param {Function} onProgress
   * @returns {Promise<number[]>}
   */
  async embedWithBrowser(text, onProgress) {
    const extractor = await this.initBrowserModel(onProgress)

    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true
    })

    const embedding = Array.from(output.data)
    this.dimensions = embedding.length
    this.modelName = 'all-MiniLM-L6-v2'
    return embedding
  }

  /**
   * Generate embeddings for multiple texts (uses native batch APIs when available)
   * @param {string[]} texts - Texts to embed
   * @param {Function} onProgress - Progress callback (current, total)
   * @returns {Promise<number[][]>}
   */
  async embedBatch(texts, onProgress) {
    const { embeddingProvider } = useAIStore.getState()

    // Use native batch APIs for cloud providers
    if (embeddingProvider === 'gemini') {
      onProgress?.(0, texts.length)
      const results = await this.embedBatchWithGemini(texts)
      onProgress?.(texts.length, texts.length)
      return results
    }

    if (embeddingProvider === 'openai') {
      onProgress?.(0, texts.length)
      const results = await this.embedBatchWithOpenAI(texts)
      onProgress?.(texts.length, texts.length)
      return results
    }

    // For Ollama and browser, embed one at a time
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
   * Get the name of the currently configured embedding model
   * @returns {Promise<string>} Model identifier
   */
  async getModelName() {
    const { embeddingProvider } = useAIStore.getState()
    switch (embeddingProvider) {
      case 'gemini': return 'gemini-embedding-001'
      case 'openai': return 'text-embedding-3-small'
      case 'ollama': return 'nomic-embed-text'
      case 'browser':
      default: return 'all-MiniLM-L6-v2'
    }
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
