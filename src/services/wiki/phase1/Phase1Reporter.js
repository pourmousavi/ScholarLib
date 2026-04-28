import { WikiPaths } from '../WikiPaths'
import { aggregateMetrics, summariseCosts, METRIC_LABELS, QUALITY_THRESHOLDS } from './QualityMetrics'

const KILL_THRESHOLDS = QUALITY_THRESHOLDS

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(1)}%`
}

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return '—'
  return Number(value).toFixed(digits)
}

function formatCurrency(value) {
  if (!value) return '$0.00'
  return `$${Number(value).toFixed(2)}`
}

function formatThreshold(metricKey) {
  const t = KILL_THRESHOLDS[metricKey]
  if (!t) return ''
  if (metricKey === 'high_impact_claim_rejection_rate' || metricKey === 'manual_cleanup_rate') {
    return t.kind === 'max' ? `≤ ${(t.value * 100).toFixed(0)}%` : `≥ ${(t.value * 100).toFixed(0)}%`
  }
  return t.kind === 'max' ? `≤ ${t.value}` : `≥ ${t.value}`
}

function buildPerPaperTable(checklists) {
  if (checklists.length === 0) return '_No papers ingested._'
  const header = '| # | Title | Date | Review (min) | Claims (✓/~/✗) | Schema issues | Reingest? |'
  const sep = '| --- | --- | --- | --- | --- | --- | --- |'
  const rows = checklists.map((checklist, index) => {
    const review = checklist.steps?.find((step) => step.name === 'review') || {}
    const verify = checklist.steps?.find((step) => step.name === 'verify_claims') || {}
    const issues = (checklist.schema_issues_observed || []).map((entry) => entry.tag).join('; ') || '—'
    const reviewMin = ((Number(review.duration_seconds_human) || 0) / 60).toFixed(1)
    return `| ${index + 1} | ${checklist.paper_title || checklist.paper_id} | ${checklist.ingested_at?.slice(0, 10) || '—'} | ${reviewMin} | ${verify.claims_supported || 0}/${verify.claims_weak || 0}/${verify.claims_unsupported || 0} | ${issues} | ${checklist.reingestion_required ? 'yes' : 'no'} |`
  })
  return [header, sep, ...rows].join('\n')
}

function buildSchemaIssueBlock(checklists) {
  const counts = new Map()
  for (const checklist of checklists) {
    for (const entry of checklist.schema_issues_observed || []) {
      counts.set(entry.tag, (counts.get(entry.tag) || 0) + 1)
    }
  }
  if (counts.size === 0) return '_No schema issues recorded._'
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return sorted.map(([tag, count]) => `- ${tag} (×${count})`).join('\n')
}

function buildPositionDraftBlock(reviews) {
  if (reviews.length === 0) return '_No position drafts reviewed._'
  const ratings = reviews.map((entry) => Number(entry.user_rating)).filter((value) => Number.isFinite(value))
  const avg = ratings.length === 0 ? null : ratings.reduce((sum, value) => sum + value, 0) / ratings.length
  const wouldEdit = reviews.filter((entry) => entry.would_edit_to_keep === true || entry.would_edit_to_keep === 'partially').length
  return [
    `- Drafts generated: ${reviews.length}`,
    `- Average voice rating: ${formatNumber(avg)} / 5`,
    `- Would-edit-to-keep: ${wouldEdit} / ${reviews.length}`,
  ].join('\n')
}

function inferAutoRecommendations(metrics, checklists) {
  const lines = []
  const schemaTags = new Set()
  for (const checklist of checklists) {
    for (const entry of checklist.schema_issues_observed || []) schemaTags.add(entry.tag)
  }
  if (schemaTags.has('verifier_overzealous')) {
    lines.push('- Loosen verifier prompt or downgrade default threshold for medium-confidence claims.')
  }
  if (schemaTags.has('frontmatter_field_missing')) {
    lines.push('- Add missing frontmatter fields surfaced in checklist observations to WIKI_SCHEMA.md.')
  }
  if (metrics.average_review_minutes?.status === 'red') {
    lines.push('- Compact diff rendering or pre-collapse low-risk pages — review time exceeded 10 min average.')
  }
  if (metrics.high_impact_claim_rejection_rate?.status === 'red') {
    lines.push('- Re-examine claim extraction prompts; verifier rejected more than 20% of high-impact claims.')
  }
  if (metrics.concept_page_usefulness_average?.status === 'red') {
    lines.push('- Concept pages did not pull weight in real writing — consider pruning or reorienting concept synthesis.')
  }
  return lines.length > 0 ? lines.join('\n') : '- No automatic patterns detected.'
}

export class Phase1Reporter {
  constructor({
    adapter,
    checklistService,
    usefulnessService,
    positionDraftGenerator,
    qualityMetricsService,
    schemaMigrations = [],
  } = {}) {
    if (!adapter) throw new Error('Phase1Reporter requires a storage adapter')
    this.adapter = adapter
    this.checklistService = checklistService
    this.usefulnessService = usefulnessService
    this.positionDraftGenerator = positionDraftGenerator
    this.qualityMetricsService = qualityMetricsService
    this.schemaMigrations = schemaMigrations
  }

  async gather() {
    const checklists = (await this.checklistService?.listAll?.()) || []
    const usefulness = (await this.usefulnessService?.listRatings?.()) || []
    const reviews = (await this.positionDraftGenerator?.listReviews?.()) || []
    const overrides = (await this.qualityMetricsService?.listOverrides?.()) || []
    return { checklists, usefulness, reviews, overrides }
  }

  async generate({
    outcome = 'completed',
    abandonedAtPaper = null,
    decisionProceedToPhase2,
    decisionReasoning = '',
    userRecommendations = '',
    manualCleanupCount = 0,
    confirmedUsefulInWriting = false,
  } = {}) {
    const data = await this.gather()
    const aggregate = aggregateMetrics({
      checklists: data.checklists,
      usefulnessRatings: data.usefulness,
      schemaMigrations: this.schemaMigrations,
      manualCleanupCount,
    })
    const cost = summariseCosts(data.checklists)
    const dates = data.checklists
      .map((checklist) => checklist.ingested_at)
      .filter(Boolean)
      .sort()

    const lines = []
    lines.push('# Phase 1 Schema Trial — Report')
    lines.push('')
    lines.push('## Summary')
    lines.push(`- Papers ingested: ${data.checklists.length}`)
    lines.push(`- Date range: ${dates[0]?.slice(0, 10) || '—'} → ${dates.at(-1)?.slice(0, 10) || '—'}`)
    lines.push(`- Outcome: ${outcome === 'abandoned' && abandonedAtPaper ? `abandoned-at-paper-${abandonedAtPaper}` : outcome}`)
    lines.push(`- Schema revisions: ${this.schemaMigrations.filter((entry) => entry.is_breaking).length}`)
    lines.push(`- Total cost: ${formatCurrency(cost.total)}`)
    lines.push('')
    lines.push('## Per-paper history')
    lines.push(buildPerPaperTable(data.checklists))
    lines.push('')
    lines.push('## Quality metrics')
    lines.push(`- High-impact claim rejection rate: ${formatPercent(aggregate.metrics.high_impact_claim_rejection_rate.value)} (threshold ${formatThreshold('high_impact_claim_rejection_rate')})`)
    lines.push(`- Average review time: ${formatNumber(aggregate.metrics.average_review_minutes.value, 1)} min (threshold ${formatThreshold('average_review_minutes')})`)
    lines.push(`- Manual cleanup rate: ${formatPercent(aggregate.metrics.manual_cleanup_rate.value)} (threshold ${formatThreshold('manual_cleanup_rate')})`)
    lines.push(`- Concept-page usefulness average: ${formatNumber(aggregate.metrics.concept_page_usefulness_average.value)} / 5 (threshold ${formatThreshold('concept_page_usefulness_average')})`)
    lines.push(`- Schema breaking migrations: ${aggregate.metrics.schema_breaking_migrations.value} (threshold ${formatThreshold('schema_breaking_migrations')})`)
    lines.push('')
    lines.push('## Schema issues observed (deduplicated)')
    lines.push(buildSchemaIssueBlock(data.checklists))
    lines.push('')
    lines.push('## Position draft outcomes')
    lines.push(buildPositionDraftBlock(data.reviews))
    lines.push('')
    lines.push('## Cost summary')
    lines.push(`- Extract: ${formatCurrency(cost.extract)}`)
    lines.push(`- Verify claims: ${formatCurrency(cost.verify_claims)}`)
    lines.push(`- Apply: ${formatCurrency(cost.apply)}`)
    lines.push(`- Projected steady state (10 papers): ${formatCurrency(cost.projected_steady_state_usd)}`)
    lines.push('')
    lines.push('## Quality threshold overrides logged')
    if (data.overrides.length === 0) {
      lines.push('_None._')
    } else {
      for (const entry of data.overrides) {
        const label = METRIC_LABELS[entry.metric] || entry.metric || 'unknown metric'
        lines.push(`- ${entry.logged_at?.slice(0, 19)} · ${label}: ${entry.reason}`)
      }
    }
    lines.push('')
    lines.push('## Recommendations for Phase 3')
    lines.push('### Auto-detected patterns')
    lines.push(inferAutoRecommendations(aggregate.metrics, data.checklists))
    lines.push('')
    lines.push('### User notes')
    lines.push(userRecommendations || '_(fill in before promoting this report)_')
    lines.push('')
    lines.push('## Decision')
    if (decisionProceedToPhase2 === undefined) {
      lines.push('- Proceed to Phase 2: pending')
    } else {
      lines.push(`- Proceed to Phase 2: ${decisionProceedToPhase2 ? 'yes' : 'no'}`)
    }
    lines.push(`- Concept pages confirmed useful in real writing: ${confirmedUsefulInWriting ? 'yes' : 'no'}`)
    lines.push(`- Reasoning: ${decisionReasoning || '_(fill in)_'}`)
    lines.push('')

    const markdown = lines.join('\n')
    return { markdown, aggregate, cost, data }
  }

  async generateAndPersist(args = {}) {
    const result = await this.generate(args)
    await this.adapter.createFolder(WikiPaths.phase1Root)
    await this.adapter.writeTextIfRevision(WikiPaths.phase1Report, result.markdown, await this._currentReportRevision())
    return result
  }

  async _currentReportRevision() {
    try {
      const meta = await this.adapter.getMetadata(WikiPaths.phase1Report)
      return meta.revision
    } catch (error) {
      if (error.code === 'STORAGE_NOT_FOUND') return null
      throw error
    }
  }
}
