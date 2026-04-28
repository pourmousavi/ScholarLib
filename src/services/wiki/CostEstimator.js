import { ulid } from 'ulid'
import { WikiPaths } from './WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from './WikiStorage'

export class CostCapExceededError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'CostCapExceededError'
    this.code = 'WIKI_COST_CAP_EXCEEDED'
    this.details = details
  }
}

const DEFAULT_CAPS = {
  monthly_cost_cap_usd: 50,
  single_operation_cap_usd: 2,
  grant_namespace_cloud_cap_usd: 0,
}

const PRICING_PER_MILLION = {
  ollama: { in: 0, out: 0 },
  claude: {
    haiku: { in: 0.8, out: 4 },
    sonnet: { in: 3, out: 15 },
    opus: { in: 15, out: 75 },
    default: { in: 3, out: 15 },
  },
  openai: { in: 2.5, out: 10 },
  gemini: { in: 1.25, out: 5 },
}

function modelTier(model) {
  const value = String(model || '').toLowerCase()
  if (value.includes('haiku')) return 'haiku'
  if (value.includes('opus')) return 'opus'
  if (value.includes('sonnet')) return 'sonnet'
  return 'default'
}

function isWithin30Days(iso, now = new Date()) {
  const time = new Date(iso).getTime()
  return Number.isFinite(time) && now.getTime() - time <= 30 * 24 * 60 * 60 * 1000
}

export class CostEstimator {
  constructor({ adapter = null, caps = {}, pricing = {} } = {}) {
    this.adapter = adapter
    this.caps = { ...DEFAULT_CAPS, ...caps }
    this.pricing = { ...PRICING_PER_MILLION, ...pricing }
  }

  estimateCost(provider, model, tokensIn = 0, tokensOut = 0) {
    const table = this.pricing[provider] || { in: 0, out: 0 }
    const price = table.in !== undefined ? table : (table[modelTier(model)] || table.default || { in: 0, out: 0 })
    return ((tokensIn * price.in) + (tokensOut * price.out)) / 1_000_000
  }

  async getRunningCost() {
    const index = this.adapter ? await readJSONOrNull(this.adapter, WikiPaths.costIndex) : null
    if (index?.generated_at && isWithin30Days(index.generated_at)) {
      return { ...this.caps, ...index }
    }

    const records = this.adapter ? await this._readCommittedRecords() : []
    const used = records
      .filter((record) => isWithin30Days(record.created_at))
      .reduce((sum, record) => sum + (record.cost_usd || 0), 0)
    const grantCloudUsed = records
      .filter((record) => isWithin30Days(record.created_at) && record.namespace?.startsWith('_private/') && record.provider !== 'ollama')
      .reduce((sum, record) => sum + (record.cost_usd || 0), 0)

    const rollup = {
      generated_at: new Date().toISOString(),
      used_usd: used,
      monthly_cap_usd: this.caps.monthly_cost_cap_usd,
      single_op_cap_usd: this.caps.single_operation_cap_usd,
      grant_cloud_used_usd: grantCloudUsed,
      grant_namespace_cloud_cap_usd: this.caps.grant_namespace_cloud_cap_usd,
    }

    if (this.adapter) await writeJSONWithRevision(this.adapter, WikiPaths.costIndex, rollup)
    return rollup
  }

  async checkPreflight({ provider, model, tokensIn = 0, tokensOut = 0, namespace = '' }) {
    const cost = this.estimateCost(provider, model, tokensIn, tokensOut)
    const running = await this.getRunningCost()
    if (cost > running.single_op_cap_usd) {
      return { ok: false, reason: 'single_operation_cap_exceeded', cost_usd: cost, running }
    }
    if (running.used_usd + cost > running.monthly_cap_usd) {
      return { ok: false, reason: 'monthly_cap_exceeded', cost_usd: cost, running }
    }
    if (namespace.startsWith('_private/') && provider !== 'ollama' && running.grant_cloud_used_usd + cost > running.grant_namespace_cloud_cap_usd) {
      return { ok: false, reason: 'grant_cloud_cap_exceeded', cost_usd: cost, running }
    }
    return { ok: true, cost_usd: cost, running }
  }

  async assertPreflight(args) {
    const result = await this.checkPreflight(args)
    if (!result.ok) {
      throw new CostCapExceededError(`Wiki cost cap exceeded: ${result.reason}`, result)
    }
    return result
  }

  async recordCall({ provider, model, task, tokensIn = 0, tokensOut = 0, namespace = '', metadata = {} }) {
    if (!this.adapter) return null
    const id = ulid()
    const createdAt = new Date()
    const record = {
      id,
      created_at: createdAt.toISOString(),
      provider,
      model,
      task,
      namespace,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: this.estimateCost(provider, model, tokensIn, tokensOut),
      metadata,
    }
    await writeJSONWithRevision(this.adapter, WikiPaths.pendingCost(id, createdAt), record)
    await writeJSONWithRevision(this.adapter, WikiPaths.committedCost(id, createdAt), { ...record, committed_at: new Date().toISOString() })
    try { await this.adapter.deleteFile(WikiPaths.pendingCost(id, createdAt)) } catch { /* already gone */ }
    return record
  }

  async rebuildIndex() {
    if (!this.adapter) return null
    const records = await this._readCommittedRecords()
    const used = records.filter((record) => isWithin30Days(record.created_at)).reduce((sum, record) => sum + (record.cost_usd || 0), 0)
    const rollup = {
      generated_at: new Date().toISOString(),
      used_usd: used,
      monthly_cap_usd: this.caps.monthly_cost_cap_usd,
      single_op_cap_usd: this.caps.single_operation_cap_usd,
      grant_cloud_used_usd: records
        .filter((record) => isWithin30Days(record.created_at) && record.namespace?.startsWith('_private/') && record.provider !== 'ollama')
        .reduce((sum, record) => sum + (record.cost_usd || 0), 0),
      grant_namespace_cloud_cap_usd: this.caps.grant_namespace_cloud_cap_usd,
      record_count: records.length,
    }
    await writeJSONWithRevision(this.adapter, WikiPaths.costIndex, rollup)
    return rollup
  }

  async _readCommittedRecords(root = WikiPaths.costRoot) {
    let entries
    try {
      entries = await this.adapter.listFolder(root)
    } catch {
      return []
    }
    const records = []
    for (const entry of entries) {
      const path = `${root}/${entry.name}`
      if (entry.type === 'folder') {
        records.push(...await this._readCommittedRecords(path))
      } else if (entry.name.endsWith('.committed.json')) {
        try { records.push(await this.adapter.readJSON(path)) } catch { /* ignored */ }
      }
    }
    return records
  }
}
