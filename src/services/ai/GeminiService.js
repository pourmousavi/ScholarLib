/**
 * GeminiService - Google Gemini API integration
 *
 * API keys are stored ONLY in localStorage, never sent to any backend.
 * Gemini API has a generous free tier (1500 RPD for Flash models).
 */
class GeminiService {
  constructor() {
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta'
  }

  /**
   * Get API key from localStorage
   * @returns {string}
   */
  getApiKey() {
    return localStorage.getItem('sv_gemini_key') || ''
  }

  /**
   * Set API key in localStorage
   * @param {string} key
   */
  setApiKey(key) {
    if (key) {
      localStorage.setItem('sv_gemini_key', key)
    } else {
      localStorage.removeItem('sv_gemini_key')
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
   * Convert ScholarLib messages to Gemini API format
   * ScholarLib: [{role: 'system'|'user'|'assistant', content}]
   * Gemini: {systemInstruction, contents: [{role: 'user'|'model', parts: [{text}]}]}
   * @param {Array} messages
   * @returns {{ systemInstruction: Object|undefined, contents: Array }}
   */
  _convertMessages(messages) {
    const systemMessage = messages.find(m => m.role === 'system')
    const chatMessages = messages.filter(m => m.role !== 'system')

    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

    const systemInstruction = systemMessage
      ? { parts: [{ text: systemMessage.content }] }
      : undefined

    return { systemInstruction, contents }
  }

  /**
   * Stream chat completion
   * @param {Array} messages - Chat messages [{role, content}]
   * @param {string} model - Model name
   * @yields {string} Content chunks
   */
  async *streamChat(messages, model = 'gemini-2.0-flash') {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw { code: 'AI_NOT_CONFIGURED', message: 'Gemini API key not set' }
    }

    const { systemInstruction, contents } = this._convertMessages(messages)

    const body = { contents }
    if (systemInstruction) {
      body.systemInstruction = systemInstruction
    }

    const res = await fetch(
      `${this.baseURL}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )

    if (!res.ok) {
      let errorMessage = 'Gemini API request failed'
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
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            yield text
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
  async chat(messages, model = 'gemini-2.0-flash') {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw { code: 'AI_NOT_CONFIGURED', message: 'Gemini API key not set' }
    }

    const { systemInstruction, contents } = this._convertMessages(messages)

    const body = { contents }
    if (systemInstruction) {
      body.systemInstruction = systemInstruction
    }

    const res = await fetch(
      `${this.baseURL}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )

    if (!res.ok) {
      const err = await res.json()
      throw { code: 'AI_REQUEST_FAILED', message: err.error?.message }
    }

    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
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
  estimateCost(promptTokens, completionTokens, model = 'gemini-2.0-flash') {
    const pricing = {
      'gemini-2.0-flash': { input: 0.0000001, output: 0.0000004 },
      'gemini-2.5-flash': { input: 0.00000015, output: 0.0000006 },
      'gemini-2.5-pro': { input: 0.00000125, output: 0.000005 }
    }
    const p = pricing[model] || pricing['gemini-2.0-flash']
    return (promptTokens * p.input) + (completionTokens * p.output)
  }

  /**
   * Get available models
   * @returns {Array}
   */
  getAvailableModels() {
    return [
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        description: 'Free tier, fast',
        inputPrice: '$0.10/M',
        outputPrice: '$0.40/M'
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Latest, thinking model',
        inputPrice: '$0.15/M',
        outputPrice: '$0.60/M'
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Most capable',
        inputPrice: '$1.25/M',
        outputPrice: '$5/M'
      }
    ]
  }
}

export const geminiService = new GeminiService()
