/**
 * ChatHistoryService - Manages chat conversation persistence
 *
 * Stores conversations in Box (_system/chat_history.json)
 */
class ChatHistoryService {
  /**
   * Generate a unique ID
   */
  generateId() {
    return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  /**
   * Load chat history from storage
   * @param {object} adapter - Storage adapter
   * @returns {Promise<object>}
   */
  async load(adapter) {
    if (!adapter) {
      return { version: '1.0', conversations: [] }
    }

    try {
      return await adapter.readJSON('_system/chat_history.json')
    } catch {
      return { version: '1.0', conversations: [] }
    }
  }

  /**
   * Save chat history to storage
   * @param {object} adapter - Storage adapter
   * @param {object} history - History object to save
   */
  async save(adapter, history) {
    if (!adapter) return
    await adapter.writeJSON('_system/chat_history.json', history)
  }

  /**
   * Create a new conversation
   * @param {object} adapter - Storage adapter
   * @param {object} scope - Conversation scope
   * @param {string} model - AI model used
   * @param {string} provider - AI provider
   * @returns {Promise<object>}
   */
  async createConversation(adapter, scope, model, provider) {
    const history = await this.load(adapter)

    const conv = {
      id: this.generateId(),
      title: 'New conversation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      scope: {
        type: scope.type,
        description: scope.description,
        docId: scope.docId,
        folderId: scope.folderId
      },
      model,
      provider,
      messages: [],
      token_usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0
      }
    }

    history.conversations.unshift(conv)
    await this.save(adapter, history)

    return conv
  }

  /**
   * Add a message to a conversation
   * @param {object} adapter - Storage adapter
   * @param {string} conversationId - Conversation ID
   * @param {object} message - Message to add
   */
  async addMessage(adapter, conversationId, message) {
    const history = await this.load(adapter)
    const conv = history.conversations.find(c => c.id === conversationId)

    if (conv) {
      conv.messages.push({
        id: `m_${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...message
      })
      conv.updated_at = new Date().toISOString()
      await this.save(adapter, history)
    }
  }

  /**
   * Update conversation title
   * @param {object} adapter - Storage adapter
   * @param {string} conversationId - Conversation ID
   * @param {string} title - New title
   */
  async updateTitle(adapter, conversationId, title) {
    const history = await this.load(adapter)
    const conv = history.conversations.find(c => c.id === conversationId)

    if (conv) {
      conv.title = title
      conv.updated_at = new Date().toISOString()
      await this.save(adapter, history)
    }
  }

  /**
   * Update token usage for a conversation
   * @param {object} adapter - Storage adapter
   * @param {string} conversationId - Conversation ID
   * @param {object} usage - Token usage { prompt_tokens, completion_tokens, cost_usd }
   */
  async updateTokenUsage(adapter, conversationId, usage) {
    const history = await this.load(adapter)
    const conv = history.conversations.find(c => c.id === conversationId)

    if (conv) {
      conv.token_usage.prompt_tokens += usage.prompt_tokens || 0
      conv.token_usage.completion_tokens += usage.completion_tokens || 0
      conv.token_usage.cost_usd += usage.cost_usd || 0
      await this.save(adapter, history)
    }
  }

  /**
   * Get a specific conversation
   * @param {object} adapter - Storage adapter
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<object|null>}
   */
  async getConversation(adapter, conversationId) {
    const history = await this.load(adapter)
    return history.conversations.find(c => c.id === conversationId) || null
  }

  /**
   * Delete a conversation
   * @param {object} adapter - Storage adapter
   * @param {string} conversationId - Conversation ID
   */
  async deleteConversation(adapter, conversationId) {
    const history = await this.load(adapter)
    history.conversations = history.conversations.filter(c => c.id !== conversationId)
    await this.save(adapter, history)
  }

  /**
   * Clear all conversations
   * @param {object} adapter - Storage adapter
   */
  async clearAll(adapter) {
    await this.save(adapter, { version: '1.0', conversations: [] })
  }

  /**
   * Auto-generate title from first AI response
   * @param {string} firstResponse - First AI response text
   * @returns {string}
   */
  autoTitle(firstResponse) {
    if (!firstResponse) return 'New conversation'

    // Take first 6 words
    const words = firstResponse.trim().split(/\s+/).slice(0, 6)
    let title = words.join(' ')

    // Truncate if too long
    if (title.length > 50) {
      title = title.slice(0, 47) + '...'
    } else if (words.length >= 6) {
      title += '...'
    }

    return title
  }

  /**
   * Search conversations
   * @param {object} adapter - Storage adapter
   * @param {string} query - Search query
   * @returns {Promise<object[]>}
   */
  async search(adapter, query) {
    const history = await this.load(adapter)
    const lowerQuery = query.toLowerCase()

    return history.conversations.filter(conv => {
      // Search in title
      if (conv.title.toLowerCase().includes(lowerQuery)) return true

      // Search in scope description
      if (conv.scope?.description?.toLowerCase().includes(lowerQuery)) return true

      // Search in messages
      return conv.messages.some(m =>
        m.content?.toLowerCase().includes(lowerQuery)
      )
    })
  }
}

export const chatHistoryService = new ChatHistoryService()
