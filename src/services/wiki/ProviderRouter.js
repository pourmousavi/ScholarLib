import { SensitivityGate } from './SensitivityGate'
import { CostEstimator } from './CostEstimator'

const DEFAULT_MODELS = {
  ollamaSmall: 'llama3.2:1b',
  ollamaMedium: 'llama3.1:8b',
  claudeHaiku: 'claude-haiku-4-5-20251001',
  claudeSonnet: 'claude-sonnet-4-20250514',
  claudeOpus: 'claude-opus-4-20250514',
}

export class ProviderRouter {
  constructor({ capabilityCheck, sensitivityGate, costEstimator, settings = {} } = {}) {
    this.capabilityCheck = capabilityCheck || { synthesis_grade_local: true, models: [] }
    this.sensitivityGate = sensitivityGate || new SensitivityGate()
    this.costEstimator = costEstimator || new CostEstimator()
    this.settings = settings
    this.cachedCapability = null
  }

  async route(task, context = {}) {
    const capability = await this._capability()
    const selected = this._select(task, capability, context)
    const sensitivity = context.sensitivity || 'public'
    const allowedProviders = context.allowedProviders || context.allowed_providers || ['ollama', 'claude', 'openai', 'gemini']
    this.sensitivityGate.check(sensitivity, allowedProviders, selected.provider)

    const tokensIn = context.estimatedTokensIn || 0
    const tokensOut = context.estimatedTokensOut || 0
    const preflight = await this.costEstimator.assertPreflight({
      provider: selected.provider,
      model: selected.model,
      tokensIn,
      tokensOut,
      namespace: context.namespace || '',
    })

    return {
      provider: selected.provider,
      model: selected.model,
      callOptions: {
        task,
        model: selected.model,
        temperature: selected.temperature ?? 0.1,
        maxTokens: Math.max(1024, Math.min(8192, tokensOut || 1024)),
        format: task === 'extract_paper' ? 'json' : undefined,
        estimated_cost_usd: preflight.cost_usd,
      },
    }
  }

  _select(task, capability, context = {}) {
    const models = { ...DEFAULT_MODELS, ...(this.settings?.models || {}) }
    const lintProvider = this.settings?.wiki?.lint_provider || 'ollama'
    const synthesisProvider = this.settings?.wiki?.synthesis_provider || 'claude'

    switch (task) {
      case 'classify':
        return { provider: 'ollama', model: this._smallestOllama(capability) || models.ollamaSmall }
      case 'extract_paper':
      case 'update_concept':
        if (!context.forceCloudFallback && capability.synthesis_grade_local !== false) {
          return { provider: 'ollama', model: this._mediumOllama(capability) || models.ollamaMedium }
        }
        return { provider: 'claude', model: models.claudeHaiku }
      case 'verify_claim':
        return { provider: 'claude', model: models.claudeSonnet }
      case 'synthesise_position':
        return synthesisProvider === 'claude-opus'
          ? { provider: 'claude', model: models.claudeOpus }
          : { provider: 'claude', model: models.claudeSonnet }
      case 'lint':
        return lintProvider === 'claude'
          ? { provider: 'claude', model: models.claudeSonnet }
          : { provider: 'ollama', model: this._mediumOllama(capability) || models.ollamaMedium }
      default:
        throw new Error(`Unknown wiki provider task: ${task}`)
    }
  }

  async _capability() {
    if (this.cachedCapability) return this.cachedCapability
    this.cachedCapability = typeof this.capabilityCheck === 'function'
      ? await this.capabilityCheck()
      : await this.capabilityCheck
    return this.cachedCapability || {}
  }

  _smallestOllama(capability) {
    return [...(capability.models || [])].sort((a, b) => this._modelSize(a) - this._modelSize(b))[0]?.name
  }

  _mediumOllama(capability) {
    return [...(capability.models || [])].sort((a, b) => Math.abs(this._modelSize(a) - 8) - Math.abs(this._modelSize(b) - 8))[0]?.name
  }

  _modelSize(model) {
    const name = typeof model === 'string' ? model : model?.name || ''
    const match = name.match(/(\d+)\s*b/i)
    return match ? Number(match[1]) : 8
  }
}
