import { aiService as defaultAIService } from './AIService'
import { indexService as defaultIndexService } from '../indexing/IndexService'
import { SensitivityGate, SensitivityViolationError } from '../wiki/SensitivityGate'
import { CostCapExceededError, CostEstimator } from '../wiki/CostEstimator'

const CLOUD_PROVIDERS = new Set(['claude', 'openai', 'gemini'])

export class ChatRefusalError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ChatRefusalError'
    this.code = details.code || 'CHAT_REFUSED'
    this.details = details
  }
}

function chunkId(chunk) {
  return chunk.chunk_id || `${chunk.doc_id || 'unknown'}:${chunk.chunk_index ?? 'unknown'}`
}

function getProviderFromSettings(settings = {}, fallback = {}) {
  return settings.provider || fallback.provider || 'none'
}

function getModelFromSettings(settings = {}, fallback = {}) {
  return settings.model || fallback.model || ''
}

function canPersistCost(adapter) {
  return adapter &&
    typeof adapter.readJSON === 'function' &&
    typeof adapter.writeJSON === 'function' &&
    typeof adapter.listFolder === 'function'
}

/**
 * ChatOrchestrator owns the non-UI chat pipeline.
 *
 * Phase 4 deliberately keeps this as a delegating refactor: RAG retrieval,
 * prompt construction, and provider calls use the same services ChatPanel used
 * directly before this extraction.
 */
export class ChatOrchestrator {
  constructor({
    indexService = defaultIndexService,
    libraryService = null,
    aiService = defaultAIService,
    sensitivityGate = new SensitivityGate(),
    costEstimator = new CostEstimator(),
    wikiRetrieval = null,
    settings = {},
  } = {}) {
    this.indexService = indexService
    this.libraryService = libraryService
    this.aiService = aiService
    this.sensitivityGate = sensitivityGate
    this.costEstimator = costEstimator
    this.wikiRetrieval = wikiRetrieval || { retrieve: async () => ({ pages: [], confidence: 0 }) }
    this.settings = settings
  }

  async classifyIntent() {
    return 'extractive'
  }

  async retrieveRAG(query, scope, options = {}) {
    const { adapter, isDemoMode = false, provider, selectedDocId, selectedFolderId } = options

    if (!adapter || isDemoMode) {
      return { chunks: [], warning: null, topK: provider === 'webllm' ? 3 : 6 }
    }

    let warning = null
    const docId = selectedDocId ?? scope?.docId
    const folderId = selectedFolderId ?? scope?.folderId
    const indexService = this.indexService

    try {
      if (scope?.type === 'document' && docId) {
        const isIndexed = await indexService.isIndexed(docId, adapter)
        if (!isIndexed) {
          warning = 'This document has not been indexed yet. Click "Index for AI" to enable document-aware answers.'
        }
      }

      if (warning) {
        return { chunks: [], warning, topK: provider === 'webllm' ? 3 : 6 }
      }

      const searchScope = {
        ...scope,
        docId,
        folderId,
      }
      const topK = provider === 'webllm' ? 3 : 6
      const chunks = await indexService.search(query, searchScope, adapter, topK)

      if (chunks.length === 0 && scope?.type === 'document' && docId) {
        warning = 'No matching content found in this document. The index may be corrupted — try re-indexing the document.'
      }

      return { chunks, warning, topK }
    } catch (error) {
      return {
        chunks: [],
        warning: error.message || 'Search failed. Please try re-indexing the document.',
        topK: provider === 'webllm' ? 3 : 6,
      }
    }
  }

  async retrieveWiki(query, scope, options = {}) {
    if (typeof this.wikiRetrieval.retrieve === 'function') {
      return this.wikiRetrieval.retrieve(query, scope, options)
    }
    return { pages: [], confidence: 0 }
  }

  async assembleContext(query, history, scope, options = {}) {
    const classification = options.classification || await this.classifyIntent(query, history)
    const rag = await this.retrieveRAG(query, scope, options)
    const wiki = await this.retrieveWiki(query, scope, options)
    const provider = getProviderFromSettings(options.settings, {
      provider: options.provider,
      model: options.model,
    })
    const maxContextChars = provider === 'webllm' ? 6000 : 12000
    const systemPrompt = this.aiService.buildSystemPrompt(scope, rag.chunks, maxContextChars)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: query },
    ]

    return {
      classification,
      rag,
      wiki,
      messages,
      systemPrompt,
      provenance: this.buildProvenance({
        classification,
        rag,
        wiki,
        provider,
        model: getModelFromSettings(options.settings, { model: options.model }),
      }),
    }
  }

  async checkSensitivity({ provider, sensitivity = 'public', allowedProviders = ['ollama', 'webllm', 'claude', 'openai', 'gemini'] }) {
    try {
      this.sensitivityGate.check(sensitivity, allowedProviders, provider)
      return { passed: true, namespace: sensitivity }
    } catch (error) {
      if (error instanceof SensitivityViolationError || error.code === 'WIKI_SENSITIVITY_VIOLATION') {
        throw new ChatRefusalError(
          'This query touches sensitive content; the configured provider does not allow it. Switch to a local provider or update settings.',
          { code: 'CHAT_SENSITIVITY_REFUSED', sensitivity }
        )
      }
      throw error
    }
  }

  async estimateCost(messages, options = {}) {
    const provider = getProviderFromSettings(options.settings, { provider: options.provider })
    const model = getModelFromSettings(options.settings, { model: options.model })
    if (!CLOUD_PROVIDERS.has(provider)) return null
    const estimator = this.costEstimator.adapter || !canPersistCost(options.adapter)
      ? this.costEstimator
      : new CostEstimator({
        adapter: options.adapter,
        caps: this.costEstimator.caps,
        pricing: this.costEstimator.pricing,
      })

    const promptText = messages.map(m => m.content).join(' ')
    const tokensIn = typeof this.aiService.estimateTokens === 'function'
      ? this.aiService.estimateTokens(promptText)
      : Math.ceil(promptText.length / 4)
    const tokensOut = options.estimatedCompletionTokens ?? 500

    if (typeof estimator.checkChatPreflight === 'function') {
      return estimator.checkChatPreflight({
        provider,
        model,
        tokensIn,
        tokensOut,
        sessionId: options.conversationId,
        enforce: options.chatCostGatesEnabled === true,
      })
    }

    return {
      ok: true,
      cost_usd: estimator.estimateCost(provider, model, tokensIn, tokensOut),
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    }
  }

  async chat(query, history, scope, options = {}) {
    const provider = getProviderFromSettings(options.settings, { provider: options.provider })
    const model = getModelFromSettings(options.settings, { model: options.model })
    const classification = await this.classifyIntent(query, history)
    const sensitivityCheck = await this.checkSensitivity({
      provider,
      sensitivity: options.sensitivity || 'public',
      allowedProviders: options.allowedProviders,
    })
    const context = await this.assembleContext(query, history, scope, {
      ...options,
      classification,
      provider,
      model,
    })

    let costEstimate = null
    try {
      costEstimate = await this.estimateCost(context.messages, { ...options, provider, model })
    } catch (error) {
      if (options.chatCostGatesEnabled === true && (error instanceof CostCapExceededError || error.code === 'WIKI_COST_CAP_EXCEEDED')) {
        throw new ChatRefusalError('This message would exceed the configured AI cost cap.', {
          code: 'CHAT_COST_CAP_EXCEEDED',
          cost: error.details,
        })
      }
      throw error
    }

    context.provenance.provider = { name: provider, model }
    context.provenance.sensitivity_check = sensitivityCheck
    context.provenance.cost_estimate_usd = costEstimate?.cost_usd ?? costEstimate?.cost ?? 0
    context.provenance.cost_usd = context.provenance.cost_estimate_usd

    if (costEstimate?.cost_usd && canPersistCost(options.adapter)) {
      const estimator = this.costEstimator.adapter
        ? this.costEstimator
        : new CostEstimator({
          adapter: options.adapter,
          caps: this.costEstimator.caps,
          pricing: this.costEstimator.pricing,
        })
      await estimator.recordChatCall({
        provider,
        model,
        tokensIn: costEstimate.tokens_in || 0,
        tokensOut: costEstimate.tokens_out || 0,
        sessionId: options.conversationId,
        metadata: { phase: 'phase4', enforced: options.chatCostGatesEnabled === true },
      })
    }

    return {
      ...context,
      stream: this.aiService.streamChat(context.messages, options.model ? { model: options.model } : {}),
    }
  }

  buildProvenance({ classification, rag, wiki, provider, model }) {
    const chunks = rag.chunks || []
    return {
      retrieval: {
        rag: {
          chunks: chunks.map(chunk => ({
            doc_id: chunk.doc_id,
            chunk_id: chunkId(chunk),
            score: chunk.score,
          })),
          top_k_used: rag.topK || chunks.length,
        },
        wiki: wiki || { pages: [], confidence: 0 },
      },
      rag: {
        chunk_count: chunks.length,
        doc_ids: [...new Set(chunks.map(chunk => chunk.doc_id).filter(Boolean))],
      },
      wiki: {
        page_count: wiki?.pages?.length || 0,
        page_ids: (wiki?.pages || []).map(page => page.id).filter(Boolean),
      },
      provider: { name: provider, model },
      sensitivity_check: { passed: true, namespace: 'public' },
      cost_estimate_usd: 0,
      cost_usd: 0,
      classification,
      timestamp: new Date().toISOString(),
    }
  }
}

export const chatOrchestrator = new ChatOrchestrator()
