/**
 * AIService - Provider-agnostic AI routing
 *
 * Routes chat requests to the appropriate backend:
 * - Ollama (local)
 * - WebLLM (browser)
 * - Claude API
 * - OpenAI API
 */
import { useAIStore } from '../../store/aiStore'
import { ollamaService } from './OllamaService'
import { webllmService } from './WebLLMService'
import { claudeService } from './ClaudeService'
import { openaiService } from './OpenAIService'

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

    if (provider === 'claude') {
      return claudeService.isConfigured()
    }

    if (provider === 'openai') {
      return openaiService.isConfigured()
    }

    return false
  }

  /**
   * Stream chat completion from the current provider
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {Object} options - Additional options (model override)
   * @yields {string} Content chunks
   */
  async *streamChat(messages, options = {}) {
    const { provider, model } = useAIStore.getState()
    const modelOverride = options.model || model

    if (provider === 'ollama') {
      yield* ollamaService.streamChat(messages, modelOverride)
    } else if (provider === 'webllm') {
      if (!webllmService.isReady()) {
        throw { code: 'AI_NOT_READY', message: 'WebLLM is not initialized. Please download the model first.' }
      }
      yield* webllmService.streamChat(messages)
    } else if (provider === 'claude') {
      if (!claudeService.isConfigured()) {
        throw { code: 'AI_NOT_CONFIGURED', message: 'Claude API key not set. Add it in Settings.' }
      }
      yield* claudeService.streamChat(messages, modelOverride)
    } else if (provider === 'openai') {
      if (!openaiService.isConfigured()) {
        throw { code: 'AI_NOT_CONFIGURED', message: 'OpenAI API key not set. Add it in Settings.' }
      }
      yield* openaiService.streamChat(messages, modelOverride)
    } else {
      throw { code: 'AI_NOT_CONFIGURED', message: 'No AI provider configured' }
    }
  }

  /**
   * Non-streaming chat completion
   * @param {Array} messages - Chat messages
   * @param {Object} options - Additional options
   * @returns {Promise<string>}
   */
  async chat(messages, options = {}) {
    const { provider, model } = useAIStore.getState()
    const modelOverride = options.model || model

    if (provider === 'ollama') {
      return await ollamaService.chat(messages, modelOverride)
    } else if (provider === 'webllm') {
      return await webllmService.chat(messages)
    } else if (provider === 'claude') {
      return await claudeService.chat(messages, modelOverride)
    } else if (provider === 'openai') {
      return await openaiService.chat(messages, modelOverride)
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

  /**
   * Estimate token count for text
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    const { provider } = useAIStore.getState()

    if (provider === 'claude') {
      return claudeService.estimateTokens(text)
    } else if (provider === 'openai') {
      return openaiService.estimateTokens(text)
    }

    // Default estimation
    return Math.ceil((text || '').length / 4)
  }

  /**
   * Estimate cost for a query (cloud providers only)
   * @param {Array} messages - Chat messages
   * @param {number} estimatedCompletionTokens - Estimated response tokens
   * @returns {{ cost: number, tokens: number, model: string } | null}
   */
  estimateCost(messages, estimatedCompletionTokens = 500) {
    const { provider, model } = useAIStore.getState()

    // Only cloud providers have costs
    if (provider !== 'claude' && provider !== 'openai') {
      return null
    }

    // Calculate prompt tokens
    const promptText = messages.map(m => m.content).join(' ')
    const promptTokens = this.estimateTokens(promptText)

    let cost = 0
    if (provider === 'claude') {
      cost = claudeService.estimateCost(promptTokens, estimatedCompletionTokens, model)
    } else if (provider === 'openai') {
      cost = openaiService.estimateCost(promptTokens, estimatedCompletionTokens, model)
    }

    return {
      cost,
      tokens: promptTokens + estimatedCompletionTokens,
      model
    }
  }

  /**
   * Check if current provider is a cloud provider (has costs)
   * @returns {boolean}
   */
  isCloudProvider() {
    const { provider } = useAIStore.getState()
    return provider === 'claude' || provider === 'openai'
  }

  /**
   * Get available models for current provider
   * @returns {Array}
   */
  getAvailableModels() {
    const { provider } = useAIStore.getState()

    if (provider === 'claude') {
      return claudeService.getAvailableModels()
    } else if (provider === 'openai') {
      return openaiService.getAvailableModels()
    } else if (provider === 'webllm') {
      return webllmService.getAvailableModels()
    }

    // Ollama models are dynamic, return empty
    return []
  }

  /**
   * Get service instance for a provider
   * @param {string} provider
   * @returns {Object}
   */
  getService(provider) {
    switch (provider) {
      case 'ollama': return ollamaService
      case 'webllm': return webllmService
      case 'claude': return claudeService
      case 'openai': return openaiService
      default: return null
    }
  }
}

export const aiService = new AIService()
