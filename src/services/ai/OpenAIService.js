/**
 * OpenAIService - OpenAI API integration
 *
 * API keys are stored ONLY in localStorage, never sent to any backend.
 */
class OpenAIService {
  constructor() {
    this.baseURL = 'https://api.openai.com/v1'
  }

  /**
   * Get API key from localStorage
   * @returns {string}
   */
  getApiKey() {
    return localStorage.getItem('sv_openai_key') || ''
  }

  /**
   * Set API key in localStorage
   * @param {string} key
   */
  setApiKey(key) {
    if (key) {
      localStorage.setItem('sv_openai_key', key)
    } else {
      localStorage.removeItem('sv_openai_key')
    }
  }

  /**
   * Check if API key is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.getApiKey()
  }

  /**
   * Stream chat completion
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {string} model - Model name
   * @yields {string} Content chunks
   */
  async *streamChat(messages, model = 'gpt-4o-mini') {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw { code: 'AI_NOT_CONFIGURED', message: 'OpenAI API key not set' }
    }

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 1024
      })
    })

    if (!res.ok) {
      let errorMessage = 'OpenAI API request failed'
      try {
        const err = await res.json()
        errorMessage = err.error?.message || errorMessage
      } catch {
        // Ignore JSON parse errors
      }
      throw { code: 'AI_REQUEST_FAILED', message: errorMessage }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        if (line === 'data: [DONE]') continue

        try {
          const data = JSON.parse(line.slice(6))
          const content = data.choices?.[0]?.delta?.content
          if (content) {
            yield content
          }
        } catch {
          // Skip invalid JSON
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
  async chat(messages, model = 'gpt-4o-mini') {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw { code: 'AI_NOT_CONFIGURED', message: 'OpenAI API key not set' }
    }

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024
      })
    })

    if (!res.ok) {
      const err = await res.json()
      throw { code: 'AI_REQUEST_FAILED', message: err.error?.message }
    }

    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  /**
   * Estimate token count (rough approximation)
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    // Rough estimate: ~4 characters per token for English
    return Math.ceil((text || '').length / 4)
  }

  /**
   * Estimate cost for a query
   * @param {number} promptTokens
   * @param {number} completionTokens
   * @param {string} model
   * @returns {number} Cost in USD
   */
  estimateCost(promptTokens, completionTokens, model = 'gpt-4o-mini') {
    const pricing = {
      'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
      'gpt-4o': { input: 0.0000025, output: 0.00001 },
      'gpt-4-turbo': { input: 0.00001, output: 0.00003 }
    }
    const p = pricing[model] || pricing['gpt-4o-mini']
    return (promptTokens * p.input) + (completionTokens * p.output)
  }

  /**
   * Get available models
   * @returns {Array}
   */
  getAvailableModels() {
    return [
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast, affordable',
        inputPrice: '$0.15/M',
        outputPrice: '$0.60/M'
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Most capable',
        inputPrice: '$2.50/M',
        outputPrice: '$10/M'
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'Previous generation',
        inputPrice: '$10/M',
        outputPrice: '$30/M'
      }
    ]
  }
}

export const openaiService = new OpenAIService()
