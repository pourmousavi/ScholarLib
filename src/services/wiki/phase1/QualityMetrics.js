import { ulid } from 'ulid'
import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from '../WikiStorage'

export const QUALITY_THRESHOLDS = {
  high_impact_claim_rejection_rate: { kind: 'max', value: 0.2 },
  average_review_minutes: { kind: 'max', value: 10 },
  schema_breaking_migrations: { kind: 'max', value: 1 },
  concept_page_usefulness_average: { kind: 'min', value: 3 },
  manual_cleanup_rate: { kind: 'max', value: 0.1 },
}

export const PHASE3_QUALITY_THRESHOLDS = {
  high_impact_claim_rejection_rate: { kind: 'max', value: 0.15 },
  average_review_minutes: { kind: 'max', value: 4 },
  schema_breaking_migrations: { kind: 'max', value: 0 },
  concept_page_usefulness_average: { kind: 'min', value: 3.5 },
  manual_cleanup_rate: { kind: 'max', value: 0.05 },
}

export const METRIC_LABELS = {
  high_impact_claim_rejection_rate: 'High-impact claim rejection rate',
  average_review_minutes: 'Average review time (minutes)',
  schema_breaking_migrations: 'Schema breaking migrations',
  concept_page_usefulness_average: 'Concept page usefulness (avg)',
  manual_cleanup_rate: 'Manual cleanup rate',
}

function classify(metric, value, threshold) {
  if (value == null || Number.isNaN(value)) return 'pending'
  if (threshold.kind === 'max') {
    if (value > threshold.value) return 'red'
    if (value > threshold.value * 0.75) return 'amber'
    return 'green'
  }
  if (threshold.kind === 'min') {
    if (value < threshold.value) return 'red'
    if (value < threshold.value + (5 - threshold.value) * 0.25) return 'amber'
    return 'green'
  }
  return 'pending'
}

function safeRate(numerator, denominator) {
  if (!denominator) return 0
  return numerator / denominator
}

function average(values) {
  const list = values.filter((value) => typeof value === 'number' && !Number.isNaN(value))
  if (list.length === 0) return null
  return list.reduce((sum, value) => sum + value, 0) / list.length
}

export function computeClaimMetrics(checklist) {
  const verify = checklist.steps?.find((step) => step.name === 'verify_claims') || {}
  const total = Number(verify.claims_total || 0)
  const weak = Number(verify.claims_weak || 0)
  const unsupported = Number(verify.claims_unsupported || 0)
  return { total, weak, unsupported }
}

export function computeReviewMinutes(checklist) {
  const review = checklist.steps?.find((step) => step.name === 'review') || {}
  const seconds = Number(review.duration_seconds_human || 0)
  return seconds / 60
}

export function isHighRiskOverride(checklist) {
  return Boolean(checklist?.high_risk_override_logged)
}

export function aggregateMetrics({
  checklists = [],
  usefulnessRatings = [],
  manualCleanupCount = 0,
  schemaMigrations = [],
  trendWindow = 5,
  thresholds = QUALITY_THRESHOLDS,
}) {
  const sorted = [...checklists].sort((a, b) => String(a.ingested_at).localeCompare(String(b.ingested_at)))
  const claimsTotal = sorted.reduce((sum, checklist) => sum + computeClaimMetrics(checklist).total, 0)
  const claimsRejected = sorted.reduce((sum, checklist) => {
    const { weak, unsupported } = computeClaimMetrics(checklist)
    return sum + weak + unsupported
  }, 0)

  const reviewMinutesNormal = sorted
    .filter((checklist) => !isHighRiskOverride(checklist))
    .map(computeReviewMinutes)
    .filter((minutes) => minutes > 0)

  const usefulnessValues = usefulnessRatings.map((entry) => Number(entry.rating)).filter((value) => Number.isFinite(value))

  const breaking = schemaMigrations.filter((entry) => entry.is_breaking).length

  const recent = sorted.slice(-trendWindow)
  const recentClaimsTotal = recent.reduce((sum, checklist) => sum + computeClaimMetrics(checklist).total, 0)
  const recentClaimsRejected = recent.reduce((sum, checklist) => {
    const { weak, unsupported } = computeClaimMetrics(checklist)
    return sum + weak + unsupported
  }, 0)

  const metrics = {
    high_impact_claim_rejection_rate: {
      value: safeRate(claimsRejected, claimsTotal),
      trend: safeRate(recentClaimsRejected, recentClaimsTotal),
      sample_size: claimsTotal,
    },
    average_review_minutes: {
      value: average(reviewMinutesNormal) ?? null,
      trend: average(reviewMinutesNormal.slice(-trendWindow)) ?? null,
      sample_size: reviewMinutesNormal.length,
    },
    schema_breaking_migrations: {
      value: breaking,
      trend: breaking,
      sample_size: schemaMigrations.length,
    },
    concept_page_usefulness_average: {
      value: average(usefulnessValues) ?? null,
      trend: average(usefulnessValues.slice(-trendWindow)) ?? null,
      sample_size: usefulnessValues.length,
    },
    manual_cleanup_rate: {
      value: safeRate(manualCleanupCount, sorted.length || 0),
      trend: safeRate(manualCleanupCount, sorted.length || 0),
      sample_size: sorted.length,
    },
  }

  for (const [key, threshold] of Object.entries(thresholds)) {
    metrics[key] = {
      ...metrics[key],
      threshold,
      status: classify(key, metrics[key].value, threshold),
    }
  }

  return {
    metrics,
    paper_count: sorted.length,
  }
}

function totalCost(checklist) {
  return (checklist.steps || []).reduce((sum, step) => sum + (Number(step.cost_usd) || 0), 0)
}

export function summariseCosts(checklists) {
  const sums = { extract: 0, verify_claims: 0, build_proposal: 0, review: 0, apply: 0, sidecar_regen: 0, total: 0 }
  for (const checklist of checklists) {
    for (const step of checklist.steps || []) {
      const cost = Number(step.cost_usd) || 0
      sums[step.name] = (sums[step.name] || 0) + cost
    }
    sums.total += totalCost(checklist)
  }
  const projectedSteadyState = checklists.length === 0 ? 0 : (sums.total / checklists.length) * 10
  return { ...sums, projected_steady_state_usd: projectedSteadyState }
}

export function detectThresholdViolations(metrics) {
  const violations = []
  for (const [key, entry] of Object.entries(metrics)) {
    if (entry.status === 'red') violations.push({ metric: key, value: entry.value, threshold: entry.threshold })
  }
  return violations
}

export class QualityMetricsService {
  constructor({ adapter } = {}) {
    if (!adapter) throw new Error('QualityMetricsService requires a storage adapter')
    this.adapter = adapter
  }

  async logOverride({ reason, metric, value, decision, paper_index } = {}) {
    if (!reason) throw new Error('logOverride requires a reason')
    const id = ulid()
    const record = {
      id,
      logged_at: new Date().toISOString(),
      metric: metric || null,
      value: value ?? null,
      decision: decision || 'continue_without_changes',
      reason,
      paper_index: paper_index ?? null,
    }
    await this.adapter.createFolder(WikiPaths.phase1OverridesRoot)
    await writeJSONWithRevision(this.adapter, WikiPaths.phase1Override(id), record)
    return record
  }

  async listOverrides() {
    let entries
    try {
      entries = await this.adapter.listFolder(WikiPaths.phase1OverridesRoot)
    } catch {
      return []
    }
    const records = []
    for (const entry of entries.filter((row) => row.type === 'file' && row.name.endsWith('.json'))) {
      const record = await readJSONOrNull(this.adapter, `${WikiPaths.phase1OverridesRoot}/${entry.name}`)
      if (record) records.push(record)
    }
    return records.sort((a, b) => String(a.logged_at).localeCompare(String(b.logged_at)))
  }
}
