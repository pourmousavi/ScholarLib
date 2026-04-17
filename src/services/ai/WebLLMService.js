/**
 * WebLLMService - Browser-based AI using WebLLM (MLC)
 *
 * Runs LLMs directly in the browser using WebGPU
 * Model is downloaded once and cached in browser storage
 */
import * as webllm from '@mlc-ai/web-llm'

class WebLLMService {
  constructor() {
    this.engine = null
    this.loadingProgress = 0
    this.isInitializing = false
    this.currentModel = null
  }

  /**
   * Check if WebGPU is supported
   * @returns {boolean}
   */
  isSupported() {
    return 'gpu' in navigator
  }

  /**
   * Check if engine is ready
   * @returns {boolean}
   */
  isReady() {
    return this.engine !== null
  }

  /**
   * Get current loading progress (0-1)
   * @returns {number}
   */
  getProgress() {
    return this.loadingProgress
  }

  /**
   * Initialize WebLLM engine with a model
   * @param {string} model - Model ID
   * @param {Function} onProgress - Progress callback
   */
  async initialize(model = 'Llama-3.2-3B-Instruct-q4f32_1-MLC', onProgress) {
    if (this.isInitializing) {
      throw { code: 'WEBLLM_BUSY', message: 'Already initializing' }
    }

    if (!this.isSupported()) {
      throw { code: 'WEBLLM_NOT_SUPPORTED', message: 'WebGPU is not supported in this browser' }
    }

    this.isInitializing = true
    this.loadingProgress = 0

    try {
      this.engine = await webllm.CreateMLCEngine(model, {
        initProgressCallback: (report) => {
          this.loadingProgress = report.progress || 0
          onProgress?.({
            progress: report.progress || 0,
            text: report.text || '',
            timeElapsed: report.timeElapsed
          })
        }
      })
      this.currentModel = model
      this.loadingProgress = 1
    } catch (error) {
      this.engine = null
      this.loadingProgress = 0
      throw {
        code: 'WEBLLM_INIT_FAILED',
        message: error.message || 'Failed to initialize WebLLM'
      }
    } finally {
      this.isInitializing = false
    }
  }

  /**
   * Stream chat completion
   * @param {Array} messages - Chat messages [{role, content}]
   * @yields {string} Content chunks
   */
  async *streamChat(messages) {
    if (!this.engine) {
      throw { code: 'WEBLLM_NOT_READY', message: 'WebLLM engine not initialized' }
    }

    const reply = await this.engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024
    })

    for await (const chunk of reply) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield content
      }
    }
  }

  /**
   * Non-streaming chat completion
   * @param {Array} messages - Chat messages
   * @returns {Promise<string>}
   */
  async chat(messages) {
    if (!this.engine) {
      throw { code: 'WEBLLM_NOT_READY', message: 'WebLLM engine not initialized' }
    }

    const reply = await this.engine.chat.completions.create({
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 1024
    })

    return reply.choices[0]?.message?.content || ''
  }

  /**
   * Unload the model to free memory
   */
  async unload() {
    if (this.engine) {
      await this.engine.unload()
      this.engine = null
      this.currentModel = null
      this.loadingProgress = 0
    }
  }

  /**
   * Get available models
   * @returns {Array}
   */
  getAvailableModels() {
    return [
      {
        id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
        name: 'Llama 3.2 3B',
        size: '2.1 GB',
        description: 'Fast, good for general tasks'
      },
      {
        id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
        name: 'Llama 3.2 1B',
        size: '0.7 GB',
        description: 'Smallest, fastest responses'
      },
      {
        id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
        name: 'Mistral 7B',
        size: '4.0 GB',
        description: 'Larger, more capable'
      }
      // TODO: Add Gemma 3/4 when MLC-compiled builds are available
      // Check: https://github.com/mlc-ai/web-llm for new model releases
    ]
  }
}

export const webllmService = new WebLLMService()
