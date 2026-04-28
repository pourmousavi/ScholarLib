import { ulid } from 'ulid'
import { WikiPaths } from '../WikiPaths'
import { writeJSONWithRevision, readJSONOrNull } from '../WikiStorage'
import { ProposalStore } from './ProposalStore'

const DEFAULT_THRESHOLD_MINUTES = 30
const TIER_WEIGHTS_MINUTES = { low: 0.2, medium: 0.7, high: 2.0 }

const PAUSE_OVERRIDES_ROOT = `${WikiPaths.systemRoot}/review_pause_overrides`

function tierCounts(proposal) {
  const counts = { low: 0, medium: 0, high: 0 }
  for (const change of proposal.page_changes || []) {
    const tier = change.risk_tier || 'low'
    if (counts[tier] != null) counts[tier] += 1
  }
  return counts
}

function estimateMinutes(counts, weights = TIER_WEIGHTS_MINUTES) {
  return (counts.low * weights.low) + (counts.medium * weights.medium) + (counts.high * weights.high)
}

export class ReviewDebtCalculator {
  constructor({ adapter, proposalStore, threshold_minutes = DEFAULT_THRESHOLD_MINUTES } = {}) {
    this.adapter = adapter
    this.proposalStore = proposalStore || (adapter ? new ProposalStore(adapter) : null)
    this.threshold_minutes = threshold_minutes
  }

  static estimateProposalMinutes(proposal, weights = TIER_WEIGHTS_MINUTES) {
    return estimateMinutes(tierCounts(proposal), weights)
  }

  static threshold() {
    return DEFAULT_THRESHOLD_MINUTES
  }

  async computeDebt() {
    const proposals = this.proposalStore ? await this.proposalStore.listPending() : []
    const items = proposals.map((proposal) => {
      const counts = tierCounts(proposal)
      return {
        proposal_id: proposal.proposal_id,
        title: proposal.source?.title || proposal.proposal_id,
        counts,
        estimated_minutes: estimateMinutes(counts),
      }
    })
    const total = items.reduce((sum, item) => sum + item.estimated_minutes, 0)
    return {
      total_minutes: total,
      threshold_minutes: this.threshold_minutes,
      paused: total > this.threshold_minutes,
      proposals: items,
      computed_at: new Date().toISOString(),
    }
  }

  async assertCanIngest({ override = false, reason = null } = {}) {
    const debt = await this.computeDebt()
    if (!debt.paused) return { ok: true, debt }
    if (!override) {
      const error = new Error(`Review queue is full — ${debt.total_minutes.toFixed(1)} min of pending review`)
      error.code = 'WIKI_REVIEW_DEBT_EXCEEDED'
      error.debt = debt
      throw error
    }
    if (!reason || !String(reason).trim()) {
      const error = new Error('Override requires a reason')
      error.code = 'WIKI_REVIEW_OVERRIDE_REQUIRES_REASON'
      throw error
    }
    await this.logOverride({ debt, reason })
    return { ok: true, debt, override: true, reason }
  }

  async logOverride({ debt, reason }) {
    if (!this.adapter) return null
    const id = ulid()
    const record = {
      id,
      logged_at: new Date().toISOString(),
      reason: String(reason).trim(),
      total_minutes: debt?.total_minutes ?? null,
      threshold_minutes: debt?.threshold_minutes ?? this.threshold_minutes,
      proposal_ids: (debt?.proposals || []).map((entry) => entry.proposal_id),
    }
    await this.adapter.createFolder(PAUSE_OVERRIDES_ROOT)
    await writeJSONWithRevision(this.adapter, `${PAUSE_OVERRIDES_ROOT}/override_${id}.json`, record)
    return record
  }

  async listOverrides() {
    if (!this.adapter) return []
    let entries
    try {
      entries = await this.adapter.listFolder(PAUSE_OVERRIDES_ROOT)
    } catch {
      return []
    }
    const records = []
    for (const entry of entries.filter((row) => row.type === 'file' && row.name.endsWith('.json'))) {
      const record = await readJSONOrNull(this.adapter, `${PAUSE_OVERRIDES_ROOT}/${entry.name}`)
      if (record) records.push(record)
    }
    return records.sort((a, b) => String(a.logged_at).localeCompare(String(b.logged_at)))
  }
}

export { TIER_WEIGHTS_MINUTES, DEFAULT_THRESHOLD_MINUTES, PAUSE_OVERRIDES_ROOT }
