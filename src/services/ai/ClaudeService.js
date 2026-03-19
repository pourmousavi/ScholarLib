/**
 * ClaudeService - Anthropic Claude API integration
 *
 * API keys are stored ONLY in localStorage, never sent to any backend.
 */
class ClaudeService {
  constructor() {
    this.baseURL = 'https://api.anthropic.com/v1'
  }

  /**
   * Get API key from localStorage
   * @returns {string}
   */
  getApiKey() {
    return localStorage.getItem('sv_claude_key') || ''
  }

  /**
   * Set API key in localStorage
   * @param {string} key
   */
  setApiKey(key) {
    if (key) {
      localStorage.setItem('sv_claude_key', key)
    } else {
      localStorage.removeItem('sv_claude_key')
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
  async *streamChat(messages, model = 'claude-haiku-4-5-20251001') {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw { code: 'AI_NOT_CONFIGURED', message: 'Claude API key not set' }
    }

    // Separate system message from conversation
    const systemMessage = messages.find(m => m.role === 'system')
    const chatMessages = messages.filter(m => m.role !== 'system')

    const res = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemMessage?.content || '',
        messages: chatMessages,
        stream: true
      })
    })

    if (!res.ok) {
      let errorMessage = 'Claude API request failed'
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
          if (data.type === 'content_block_delta' && data.delta?.text) {
            yield data.delta.text
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
  async chat(messages, model = 'claude-haiku-4-5-20251001') {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw { code: 'AI_NOT_CONFIGURED', message: 'Claude API key not set' }
    }

    const systemMessage = messages.find(m => m.role === 'system')
    const chatMessages = messages.filter(m => m.role !== 'system')

    const res = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemMessage?.content || '',
        messages: chatMessages
      })
    })

    if (!res.ok) {
      const err = await res.json()
      throw { code: 'AI_REQUEST_FAILED', message: err.error?.message }
    }

    const data = await res.json()
    return data.content?.[0]?.text || ''
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
  estimateCost(promptTokens, completionTokens, model = 'claude-haiku-4-5-20251001') {
    const pricing = {
      'claude-haiku-4-5-20251001': { input: 0.0000008, output: 0.000004 },
      'claude-sonnet-4-20250514': { input: 0.000003, output: 0.000015 },
      'claude-opus-4-20250514': { input: 0.000015, output: 0.000075 }
    }
    const p = pricing[model] || pricing['claude-haiku-4-5-20251001']
    return (promptTokens * p.input) + (completionTokens * p.output)
  }

  /**
   * Get available models
   * @returns {Array}
   */
  getAvailableModels() {
    return [
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku',
        description: 'Fast, affordable',
        inputPrice: '$0.80/M',
        outputPrice: '$4/M'
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet',
        description: 'Balanced performance',
        inputPrice: '$3/M',
        outputPrice: '$15/M'
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus',
        description: 'Most capable',
        inputPrice: '$15/M',
        outputPrice: '$75/M'
      }
    ]
  }
}

export const claudeService = new ClaudeService()
