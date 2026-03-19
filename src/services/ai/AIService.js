/**
 * AIService - Provider-agnostic AI routing
 *
 * Routes chat requests to the appropriate backend:
 * - Ollama (local)
 * - WebLLM (browser)
 * - Claude API (Stage 10)
 * - OpenAI API (Stage 10)
 */
import { useAIStore } from '../../store/aiStore'
import { ollamaService } from './OllamaService'
import { webllmService } from './WebLLMService'

class AIService {
  /**
   * Build system prompt for academic assistant
   * @param {Object} scope - Current scope settings
   * @param {Array} retrievedChunks - Retrieved document chunks (Stage 11)
   * @returns {string}
   */
  buildSystemPrompt(scope, retrievedChunks = []) {
    const contextSection = retrievedChunks.length > 0
      ? `\n\nRetrieved context:\n${retrievedChunks.map(c => `[${c.citation}]\n${c.text}`).join('\n\n')}`
      : ''

    return `You are ScholarLib AI, an academic research assistant.
The user is reviewing ${scope.description}.
${retrievedChunks.length > 0 ? `${retrievedChunks.length} relevant excerpts from ${scope.docCount} documents have been retrieved.` : 'No document context is currently loaded.'}
${contextSection}

Rules:
- Answer based on the retrieved context when available
- Cite sources as [Author Year] inline when referencing documents
- If the answer isn't in the context, you may use your general knowledge but note this
- Be concise and academically precise
- Format responses with markdown when helpful`
  }

  /**
   * Check if the current provider is available
   * @returns {Promise<boolean>}
   */
  async checkAvailability() {
    const { provider } = useAIStore.getState()

    if (provider === 'ollama') {
      return await ollamaService.isAvailable()
    }

    if (provider === 'webllm') {
      return webllmService.isSupported() && webllmService.isReady()
    }

    // Claude and OpenAI will be checked in Stage 10
    return false
  }

  /**
   * Stream chat completion from the current provider
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {Object} options - Additional options
   * @yields {string} Content chunks
   */
  async *streamChat(messages, options = {}) {
    const { provider, model } = useAIStore.getState()

    if (provider === 'ollama') {
      yield* ollamaService.streamChat(messages, model)
    } else if (provider === 'webllm') {
      if (!webllmService.isReady()) {
        throw { code: 'AI_NOT_READY', message: 'WebLLM is not initialized. Please download the model first.' }
      }
      yield* webllmService.streamChat(messages)
    } else if (provider === 'claude') {
      // Stage 10
      throw { code: 'AI_NOT_CONFIGURED', message: 'Claude API not yet implemented' }
    } else if (provider === 'openai') {
      // Stage 10
      throw { code: 'AI_NOT_CONFIGURED', message: 'OpenAI API not yet implemented' }
    } else {
      throw { code: 'AI_NOT_CONFIGURED', message: 'No AI provider configured' }
    }
  }

  /**
   * Non-streaming chat completion
   * @param {Array} messages - Chat messages
   * @returns {Promise<string>}
   */
  async chat(messages) {
    const { provider, model } = useAIStore.getState()

    if (provider === 'ollama') {
      return await ollamaService.chat(messages, model)
    } else if (provider === 'webllm') {
      return await webllmService.chat(messages)
    }

    throw { code: 'AI_NOT_CONFIGURED', message: 'No AI provider configured' }
  }

  /**
   * Generate embeddings (for RAG in Stage 11)
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>}
   */
  async embed(text) {
    const { provider } = useAIStore.getState()

    if (provider === 'ollama') {
      return await ollamaService.embed(text)
    }

    // WebLLM doesn't support embeddings natively
    // Will add transformers.js fallback in Stage 11
    throw { code: 'EMBED_NOT_SUPPORTED', message: 'Embeddings not supported with current provider' }
  }

  /**
   * Initialize WebLLM (download model)
   * @param {string} model - Model ID
   * @param {Function} onProgress - Progress callback
   */
  async initializeWebLLM(model, onProgress) {
    await webllmService.initialize(model, onProgress)
  }

  /**
   * Get WebLLM status
   */
  getWebLLMStatus() {
    return {
      isSupported: webllmService.isSupported(),
      isReady: webllmService.isReady(),
      progress: webllmService.getProgress(),
      models: webllmService.getAvailableModels()
    }
  }
}

export const aiService = new AIService()
