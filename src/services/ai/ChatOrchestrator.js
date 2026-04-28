import { aiService as defaultAIService } from './AIService'
import { indexService as defaultIndexService } from '../indexing/IndexService'
import { SensitivityGate, SensitivityViolationError } from '../wiki/SensitivityGate'
import { CostCapExceededError, CostEstimator } from '../wiki/CostEstimator'
import { IntentClassifier } from '../wiki/chat/IntentClassifier'
import { WikiRetrieval } from '../wiki/chat/WikiRetrieval'
import { HybridRetrieval } from './improved_rag/HybridRetrieval'
import { WikiPaths } from '../wiki/WikiPaths'
import { readJSONOrNull } from '../wiki/WikiStorage'

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

function wikiEnabled(options = {}) {
  if (options.wikiEnabled !== undefined) return options.wikiEnabled === true
  if (options.settings?.wiki?.enabled !== undefined) return options.settings.wiki.enabled === true
  if (typeof localStorage !== 'undefined') return localStorage.getItem('sv_wiki_enabled') === 'true'
  return false
}

function confidenceRank(confidence) {
  return { low: 0, medium: 1, high: 2 }[confidence] ?? 0
}

function pageToContextChunk(page) {
  return {
    doc_id: page.page_id || page.id,
    chunk_id: `wiki:${page.page_id || page.id}`,
    chunk_index: 0,
    score: page.relevance_score || 0,
    text: page.content || '',
    citation: `Wiki: ${page.title || page.page_id || page.id}`,
    docTitle: page.title || page.page_id || page.id,
    source_type: 'wiki',
    page_id: page.page_id || page.id,
  }
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
    wikiRetrieval = new WikiRetrieval(),
    intentClassifier = new IntentClassifier(),
    improvedRag = new HybridRetrieval({ indexService }),
    settings = {},
  } = {}) {
    this.indexService = indexService
    this.libraryService = libraryService
    this.aiService = aiService
    this.sensitivityGate = sensitivityGate
    this.costEstimator = costEstimator
    this.wikiRetrieval = wikiRetrieval || { retrieve: async () => ({ pages: [], confidence: 'low' }) }
    this.intentClassifier = intentClassifier
    this.improvedRag = improvedRag
    this.settings = settings
  }

  async classifyIntent(query, history = [], options = {}) {
    if (!wikiEnabled(options)) {
      return 'extractive'
    }
    return this.intentClassifier.classify(query, history)
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
    if (!wikiEnabled(options)) return { pages: [], confidence: 0 }
    if (typeof this.wikiRetrieval.retrieve === 'function') {
      return this.wikiRetrieval.retrieve(query, scope, options)
    }
    return { pages: [], confidence: 'low', retrieval_method: 'unavailable' }
  }

  async retrieveImprovedRAG(query, scope, options = {}) {
    return this.improvedRag.retrieve(query, scope, options)
  }

  async assembleContext(query, history, scope, options = {}) {
    const classification = options.classification || await this.classifyIntent(query, history, options)
    let plan = await this.buildRetrievalPlan(classification, scope, options)
    let rag = { chunks: [], warning: null, topK: options.provider === 'webllm' ? 3 : 6 }
    let wiki = { pages: [], confidence: wikiEnabled(options) ? 'low' : 0, retrieval_method: 'not_used' }
    let improvedRag = null

    if (plan.use_improved_rag) {
      improvedRag = await this.retrieveImprovedRAG(query, scope, { ...options, history })
      rag = { chunks: improvedRag.chunks || [], warning: null, topK: improvedRag.chunks?.length || 0, improved: true, summaries: improvedRag.summaries || [] }
    } else if (plan.use_rag) {
      rag = await this.retrieveRAG(query, scope, options)
    }
    if (plan.use_wiki) {
      wiki = await this.retrieveWiki(query, scope, options)
    }

    if (wikiEnabled(options) && plan.intent === 'synthetic' && plan.use_wiki && confidenceRank(wiki.confidence) === 0 && !plan.use_rag) {
      plan = { ...plan, use_rag: true, fallback_reason: 'low_wiki_confidence' }
      rag = await this.retrieveRAG(query, scope, options)
    }
    if (wikiEnabled(options) && plan.intent === 'extractive' && plan.use_rag && (rag.chunks || []).length === 0 && !plan.use_wiki) {
      plan = { ...plan, use_wiki: true, fallback_reason: 'empty_rag' }
      wiki = await this.retrieveWiki(query, scope, options)
    }
    if (this.touchesPositionOrGrant(scope, query, wiki)) {
      plan = { ...plan, use_rag: true, use_wiki: true, mandatory_both_reason: 'position_or_grant' }
      if (!rag.chunks?.length) rag = await this.retrieveRAG(query, scope, options)
      if (!wiki.pages?.length) wiki = await this.retrieveWiki(query, scope, options)
    }

    const provider = getProviderFromSettings(options.settings, {
      provider: options.provider,
      model: options.model,
    })
    const sensitivityCheck = await this.checkSensitivity({
      provider,
      sensitivity: this.detectSensitivity(options.sensitivity || 'public', wiki, query),
      allowedProviders: options.allowedProviders,
    })
    const maxContextChars = provider === 'webllm' ? 6000 : 12000
    const mergedChunks = this.mergeWithBudget(wiki, rag, plan, options.retrievalBudget || 60_000)
    const systemPrompt = this.aiService.buildSystemPrompt(scope, mergedChunks, maxContextChars)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: query },
    ]

    return {
      classification,
      rag,
      wiki,
      improvedRag,
      plan,
      messages,
      systemPrompt,
      sensitivityCheck,
      provenance: this.buildProvenance({
        classification,
        rag,
        wiki,
        improvedRag,
        plan,
        provider,
        model: getModelFromSettings(options.settings, { model: options.model }),
      }),
    }
  }

  async buildRetrievalPlan(intent, scope, options = {}) {
    const manual = options.manual_route || options.routeMode
    if (manual === 'wiki_only' || manual === 'wiki_assisted') return { intent: intent.preference || intent, use_wiki: true, use_rag: false, use_improved_rag: false, source: 'manual' }
    if (manual === 'rag_only' || manual === 'current_rag') return { intent: intent.preference || intent, use_wiki: false, use_rag: true, use_improved_rag: false, source: 'manual' }
    if (manual === 'improved_rag') return { intent: intent.preference || intent, use_wiki: false, use_rag: false, use_improved_rag: true, source: 'manual' }
    if (manual === 'both') return { intent: intent.preference || intent, use_wiki: wikiEnabled(options), use_rag: true, use_improved_rag: false, source: 'manual' }

    if (!wikiEnabled(options)) return { intent: 'extractive', use_wiki: false, use_rag: true, use_improved_rag: false, source: 'wiki_disabled' }

    const routedDefault = await this.readRoutingDefault(intent.preference || intent, options)
    if (routedDefault === 'current_rag') return { intent: intent.preference || intent, use_wiki: false, use_rag: true, use_improved_rag: false, source: 'benchmark_default' }
    if (routedDefault === 'improved_rag') return { intent: intent.preference || intent, use_wiki: false, use_rag: false, use_improved_rag: true, source: 'benchmark_default' }
    if (routedDefault === 'wiki_assisted') return { intent: intent.preference || intent, use_wiki: true, use_rag: false, use_improved_rag: false, source: 'benchmark_default' }

    const preference = intent.preference || intent
    if (preference === 'synthetic') return { intent: preference, use_wiki: true, use_rag: false, use_improved_rag: false, source: 'classifier' }
    if (preference === 'extractive') return { intent: preference, use_wiki: false, use_rag: true, use_improved_rag: false, source: 'classifier' }
    return { intent: preference, use_wiki: true, use_rag: true, use_improved_rag: false, source: 'classifier' }
  }

  async readRoutingDefault(preference, options = {}) {
    if (!options.adapter) return null
    const defaults = await readJSONOrNull(options.adapter, WikiPaths.chatRoutingDefaults)
    return defaults?.[`${preference}_default`] || null
  }

  detectSensitivity(defaultSensitivity, wiki, query = '') {
    const pages = wiki?.pages || []
    if (pages.some(page => page.frontmatter?.sensitivity === 'confidential' || page.path?.includes('/_private/'))) {
      return 'confidential'
    }
    if (String(query || '').toLowerCase().includes('grant')) return 'confidential'
    return defaultSensitivity
  }

  touchesPositionOrGrant(scope, query, wiki) {
    const text = `${scope?.type || ''} ${query || ''}`.toLowerCase()
    if (text.includes('grant') || text.includes('position')) return true
    return (wiki?.pages || []).some(page => page.type === 'position' || page.path?.includes('/grant/') || page.frontmatter?.type === 'grant')
  }

  mergeWithBudget(wiki, rag, plan, budgetTokens) {
    const wikiChunks = plan.use_wiki ? (wiki.pages || []).map(pageToContextChunk) : []
    const ragChunks = rag.chunks || []
    const ordered = [...wikiChunks, ...ragChunks]
    const kept = []
    let used = 0
    for (const chunk of ordered) {
      const cost = Math.ceil(String(chunk.text || '').length / 4)
      if (used + cost > budgetTokens && kept.length > 0) continue
      kept.push(chunk)
      used += cost
      if (used >= budgetTokens) break
    }
    return kept
  }

  async checkSensitivity({ provider, sensitivity = 'public', allowedProviders = null }) {
    try {
      const allowed = allowedProviders || (sensitivity === 'confidential'
        ? ['ollama', 'webllm', 'university_approved']
        : ['ollama', 'webllm', 'claude', 'openai', 'gemini'])
      this.sensitivityGate.check(sensitivity, allowed, provider)
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
    const classification = await this.classifyIntent(query, history, options)
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
    context.provenance.sensitivity_check = context.sensitivityCheck
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

  buildProvenance({ classification, rag, wiki, improvedRag, plan, provider, model }) {
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
      routing: plan || null,
      improved_rag: improvedRag ? {
        chunk_count: improvedRag.chunks?.length || 0,
        summary_count: improvedRag.summaries?.length || 0,
        queries: improvedRag.queries || [],
      } : null,
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
