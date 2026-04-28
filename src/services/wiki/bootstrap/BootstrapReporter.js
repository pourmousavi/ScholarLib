import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull } from '../WikiStorage'
import { parseYamlFence } from '../WikiMarkdown'
import { aggregateMetrics, summariseCosts, METRIC_LABELS, PHASE3_QUALITY_THRESHOLDS } from '../phase1/QualityMetrics'
import {
  computePerThemeCoverage,
  computeCrossPaperCoherence,
  computeBootstrapProgress,
  computeCostProjection,
} from '../phase3/Phase3Metrics'
import { OperationLogService } from '../OperationLogService'
import { STORAGE_ERRORS } from '../../storage/StorageAdapter'

const RECENT_REVIEW_WINDOW = 10

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
  const t = PHASE3_QUALITY_THRESHOLDS[metricKey]
  if (!t) return ''
  if (metricKey === 'high_impact_claim_rejection_rate' || metricKey === 'manual_cleanup_rate') {
    return t.kind === 'max' ? `≤ ${(t.value * 100).toFixed(0)}%` : `≥ ${(t.value * 100).toFixed(0)}%`
  }
  return t.kind === 'max' ? `≤ ${t.value}` : `≥ ${t.value}`
}

function listClaimBlocks(body) {
  const text = String(body || '')
  const opener = '```scholarlib-claim'
  const claims = []
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf(opener, cursor)
    if (start === -1) break
    const contentStart = text.indexOf('\n', start)
    if (contentStart === -1) break
    const end = text.indexOf('\n```', contentStart + 1)
    if (end === -1) break
    let parsed = null
    try {
      parsed = parseYamlFence(text.slice(start, end + 4), 'scholarlib-claim')
    } catch {
      parsed = null
    }
    if (parsed) claims.push(parsed)
    cursor = end + 4
  }
  return claims
}

function safeRate(numerator, denominator) {
  if (!denominator) return 0
  return numerator / denominator
}

export async function checkPhase5Gates({
  pagesSidecar,
  pageBodies = new Map(),
  lintResult = null,
  checklists = [],
  committedOps = [],
  manualClaimVerifications = [],
  ragParityPassing = null,
  ownerConfirmsUseful = false,
} = {}) {
  const pages = pagesSidecar?.pages || []
  const counts = pages.reduce((acc, row) => {
    const type = row.id?.startsWith('p_') ? 'paper'
      : row.id?.startsWith('c_') ? 'concept'
      : row.id?.startsWith('m_') ? 'method'
      : row.id?.startsWith('d_') ? 'dataset'
      : row.id?.startsWith('po_') ? 'position'
      : 'other'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {})

  const paperCount = counts.paper || 0
  const conceptMethodCount = (counts.concept || 0) + (counts.method || 0)

  const linkFindings = lintResult?.findings?.filter((f) => f.rule === 'broken_wikilinks') || []
  const totalLinks = lintResult?.summary?.total_wikilinks || null
  const brokenRate = totalLinks
    ? linkFindings.length / totalLinks
    : (linkFindings.length === 0 ? 0 : null)

  let unsupportedHighImpact = 0
  for (const row of pages) {
    const body = pageBodies.get(row.id) || ''
    for (const claim of listClaimBlocks(body)) {
      const status = String(claim.status || '').toLowerCase()
      const tier = String(claim.risk_tier || claim.risk || '').toLowerCase()
      if ((tier === 'high' || tier === 'top') && status === 'unsupported') {
        unsupportedHighImpact += 1
      }
    }
  }

  const recentChecklists = [...checklists]
    .sort((a, b) => String(a.ingested_at).localeCompare(String(b.ingested_at)))
    .slice(-RECENT_REVIEW_WINDOW)
  const reviewMinutes = recentChecklists
    .map((checklist) => {
      const review = (checklist.steps || []).find((step) => step.name === 'review') || {}
      return Number(review.duration_seconds_human || 0) / 60
    })
    .filter((value) => value > 0)
  const avgRecentReview = reviewMinutes.length === 0
    ? null
    : reviewMinutes.reduce((sum, value) => sum + value, 0) / reviewMinutes.length

  const recentOps = [...committedOps]
    .sort((a, b) => String(b.committed_at || '').localeCompare(String(a.committed_at || '')))
    .slice(0, 20)
  const writeConflicts = recentOps.filter((op) => {
    const recovery = op.recovery || op.recovery_status
    return recovery?.action === 'safety_mode' || op.state === 'safety_mode'
  })

  const manualVerifiedCount = manualClaimVerifications.length

  const gates = [
    {
      id: 'gate_paper_count',
      name: '≥30 paper pages accepted',
      status: paperCount >= 30 ? 'pass' : (paperCount >= 25 ? 'trending' : 'fail'),
      value: paperCount,
      details: { required: 30 },
    },
    {
      id: 'gate_concept_method_count',
      name: '≥8 concept/method pages accepted',
      status: conceptMethodCount >= 8 ? 'pass' : (conceptMethodCount >= 5 ? 'trending' : 'fail'),
      value: conceptMethodCount,
      details: { required: 8 },
    },
    {
      id: 'gate_broken_links',
      name: '<5% broken wikilinks',
      status: brokenRate == null ? 'pending' : (brokenRate < 0.05 ? 'pass' : 'fail'),
      value: brokenRate,
      details: { broken_count: linkFindings.length, total_links: totalLinks },
    },
    {
      id: 'gate_unsupported_high_impact',
      name: 'Zero unsupported high-impact claims',
      status: unsupportedHighImpact === 0 ? 'pass' : 'fail',
      value: unsupportedHighImpact,
      details: {},
    },
    {
      id: 'gate_manual_claim_verifications',
      name: '≥20 randomly sampled claims manually verified',
      status: manualVerifiedCount >= 20 ? 'pass' : (manualVerifiedCount >= 10 ? 'trending' : 'pending'),
      value: manualVerifiedCount,
      details: { required: 20 },
    },
    {
      id: 'gate_avg_review_time',
      name: 'Average normal-paper review time <5 min (last 10 reviews)',
      status: avgRecentReview == null ? 'pending' : (avgRecentReview < 5 ? 'pass' : 'fail'),
      value: avgRecentReview,
      details: { sample_size: reviewMinutes.length },
    },
    {
      id: 'gate_no_write_conflicts',
      name: 'No unresolved write-conflict bug in last 20 accepted operations',
      status: recentOps.length === 0 ? 'pending' : (writeConflicts.length === 0 ? 'pass' : 'fail'),
      value: writeConflicts.length,
      details: { sample_size: recentOps.length },
    },
    {
      id: 'gate_rag_parity',
      name: 'RAG parity test suite passes after ChatOrchestrator extraction',
      status: ragParityPassing == null ? 'pending' : (ragParityPassing ? 'pass' : 'fail'),
      value: ragParityPassing,
      details: {},
    },
    {
      id: 'gate_owner_confirms_useful',
      name: 'Project owner confirms wiki pages used in real writing session',
      status: ownerConfirmsUseful ? 'pass' : 'pending',
      value: ownerConfirmsUseful,
      details: {},
    },
  ]

  const passing = gates.filter((gate) => gate.status === 'pass').length
  const failing = gates.filter((gate) => gate.status === 'fail').length
  const trending = gates.filter((gate) => gate.status === 'trending').length
  return {
    gates,
    summary: { total: gates.length, pass: passing, fail: failing, trending, pending: gates.length - passing - failing - trending },
  }
}

function buildPerThemeBlock(coverage) {
  if (!coverage || coverage.length === 0) return '_No themes recorded._'
  const header = '| Theme | Papers ingested | Concept pages | Well-supported (≥3 papers) |'
  const sep = '| --- | --- | --- | --- |'
  const rows = coverage.map((entry) =>
    `| ${entry.theme} | ${entry.papers_ingested} | ${entry.concept_pages} | ${entry.well_supported_concept_pages} |`
  )
  return [header, sep, ...rows].join('\n')
}

function buildCrossPaperBlock(coherence) {
  if (!coherence || !coherence.entries || coherence.entries.length === 0) return '_No concept pages yet._'
  const header = '| Concept | Supporting papers | Claims |'
  const sep = '| --- | --- | --- |'
  const rows = coherence.entries.map((entry) =>
    `| ${entry.title} | ${entry.supporting_papers} | ${entry.claims_count} |`
  )
  return [
    `Average supporting papers: ${formatNumber(coherence.average_supporting_papers, 1)} · stddev claim count: ${formatNumber(coherence.stddev_claim_count, 2)}`,
    '',
    header,
    sep,
    ...rows,
  ].join('\n')
}

function buildGateBlock(gateResult) {
  const lines = []
  lines.push(`Passing: ${gateResult.summary.pass} · trending: ${gateResult.summary.trending} · failing: ${gateResult.summary.fail} · pending: ${gateResult.summary.pending}`)
  lines.push('')
  for (const gate of gateResult.gates) {
    const valueText = gate.value == null ? '—' : String(gate.value)
    lines.push(`- [${gate.status}] ${gate.name} — value: ${valueText}`)
  }
  return lines.join('\n')
}

async function readPageBodies(adapter, pagesSidecar) {
  const map = new Map()
  for (const row of pagesSidecar?.pages || []) {
    if (!row.path) continue
    try {
      const { text } = await adapter.readTextWithMetadata(row.path)
      const bodyStart = text.indexOf('\n---\n')
      const body = bodyStart >= 0 ? text.slice(bodyStart + 5) : text
      map.set(row.id, body)
    } catch (error) {
      if (error?.code !== STORAGE_ERRORS.NOT_FOUND) throw error
    }
  }
  return map
}

export class BootstrapReporter {
  constructor({
    adapter,
    planService,
    checklistService,
    usefulnessService,
    qualityMetricsService,
    lintService,
    schemaMigrations = [],
    manualClaimVerifications = [],
  } = {}) {
    if (!adapter) throw new Error('BootstrapReporter requires a storage adapter')
    if (!planService) throw new Error('BootstrapReporter requires a planService')
    this.adapter = adapter
    this.planService = planService
    this.checklistService = checklistService
    this.usefulnessService = usefulnessService
    this.qualityMetricsService = qualityMetricsService
    this.lintService = lintService
    this.schemaMigrations = schemaMigrations
    this.manualClaimVerifications = manualClaimVerifications
  }

  async gather() {
    const plan = await this.planService.loadPlan()
    const checklists = (await this.checklistService?.listAll?.()) || []
    const usefulness = (await this.usefulnessService?.listRatings?.()) || []
    const overrides = (await this.qualityMetricsService?.listOverrides?.()) || []
    const pagesSidecar = await readJSONOrNull(this.adapter, WikiPaths.pagesSidecar)
    const committedOps = (await OperationLogService.listCommitted(this.adapter, 50)) || []
    const lintResult = this.lintService ? await this.lintService.runAll() : null
    return { plan, checklists, usefulness, overrides, pagesSidecar, committedOps, lintResult }
  }

  async generate({
    outcome = 'completed',
    decisionProceedToPhase4,
    decisionReasoning = '',
    userObservations = '',
    confirmedUsefulInWriting = false,
    ragParityPassing = null,
    manualCleanupCount = 0,
  } = {}) {
    const data = await this.gather()
    const aggregate = aggregateMetrics({
      checklists: data.checklists,
      usefulnessRatings: data.usefulness,
      schemaMigrations: this.schemaMigrations,
      manualCleanupCount,
      thresholds: PHASE3_QUALITY_THRESHOLDS,
    })
    const cost = summariseCosts(data.checklists)
    const coverage = await computePerThemeCoverage(data.plan, this.adapter)
    const coherence = await computeCrossPaperCoherence(this.adapter, { topN: 10 })
    const progress = computeBootstrapProgress(data.plan)
    const projection = computeCostProjection(data.checklists, data.plan)
    const pageBodies = await readPageBodies(this.adapter, data.pagesSidecar)
    const gateResult = await checkPhase5Gates({
      pagesSidecar: data.pagesSidecar,
      pageBodies,
      lintResult: data.lintResult,
      checklists: data.checklists,
      committedOps: data.committedOps,
      manualClaimVerifications: this.manualClaimVerifications,
      ragParityPassing,
      ownerConfirmsUseful: confirmedUsefulInWriting,
    })

    const pages = data.pagesSidecar?.pages || []
    const byType = pages.reduce((acc, row) => {
      const prefix = String(row.id || '').split('_')[0]
      const type = prefix === 'p' ? 'paper'
        : prefix === 'c' ? 'concept'
        : prefix === 'm' ? 'method'
        : prefix === 'd' ? 'dataset'
        : prefix === 'pe' ? 'person'
        : prefix === 'po' ? 'position'
        : 'other'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {})

    const dates = data.checklists
      .map((checklist) => checklist.ingested_at)
      .filter(Boolean)
      .sort()

    const lines = []
    lines.push('# Phase 3 Controlled Bootstrap — Report')
    lines.push('')
    lines.push('## Summary')
    lines.push(`- Own-papers ingested: ${progress.own_papers.ingested} / target ${progress.targets?.own_papers?.max ?? 30}`)
    lines.push(`- External anchors ingested: ${progress.external_anchors.ingested} / target ${progress.targets?.external_anchors?.max ?? 15}`)
    lines.push(`- Date range: ${dates[0]?.slice(0, 10) || '—'} → ${dates.at(-1)?.slice(0, 10) || '—'}`)
    lines.push(`- Schema revisions during Phase 3: ${this.schemaMigrations.filter((entry) => entry.is_breaking).length}`)
    lines.push(`- Total cost: ${formatCurrency(cost.total)} (vs projected ${formatCurrency(projection.projected_total_usd)})`)
    lines.push(`- Outcome: ${outcome}`)
    lines.push('')
    lines.push('## Per-theme structure')
    lines.push(buildPerThemeBlock(coverage))
    lines.push('')
    lines.push('## Cross-paper coherence (top concepts)')
    lines.push(buildCrossPaperBlock(coherence))
    lines.push('')
    lines.push('## Wiki state at Phase 3 end')
    lines.push(`- Total pages: ${pages.length}`)
    lines.push(`- By type: paper ${byType.paper || 0}, concept ${byType.concept || 0}, method ${byType.method || 0}, dataset ${byType.dataset || 0}, person ${byType.person || 0}, position ${byType.position || 0}`)
    if (data.lintResult) {
      lines.push(`- Lint findings: ${data.lintResult.summary.total} (broken_wikilinks=${data.lintResult.summary.by_rule.broken_wikilinks || 0}, contested_claims=${data.lintResult.summary.by_rule.contested_claims || 0})`)
    }
    lines.push('')
    lines.push('## Quality metrics over Phase 3')
    lines.push(`- High-impact claim rejection rate: ${formatPercent(aggregate.metrics.high_impact_claim_rejection_rate.value)} (threshold ${formatThreshold('high_impact_claim_rejection_rate')})`)
    lines.push(`- Average review time: ${formatNumber(aggregate.metrics.average_review_minutes.value, 1)} min (threshold ${formatThreshold('average_review_minutes')})`)
    lines.push(`- Manual cleanup rate: ${formatPercent(aggregate.metrics.manual_cleanup_rate.value)} (threshold ${formatThreshold('manual_cleanup_rate')})`)
    lines.push(`- Concept-page usefulness: ${formatNumber(aggregate.metrics.concept_page_usefulness_average.value)} / 5 (threshold ${formatThreshold('concept_page_usefulness_average')})`)
    lines.push(`- Schema breaking migrations: ${aggregate.metrics.schema_breaking_migrations.value} (threshold ${formatThreshold('schema_breaking_migrations')})`)
    lines.push('')
    lines.push('## Cost summary')
    lines.push(`- Spent: ${formatCurrency(cost.total)}`)
    lines.push(`- Average per paper: ${formatCurrency(projection.average_per_paper_usd)}`)
    lines.push(`- Projected total: ${formatCurrency(projection.projected_total_usd)} (bounds ${formatCurrency(projection.projection_lower_bound_usd)} – ${formatCurrency(projection.projection_upper_bound_usd)})`)
    if (projection.over_budget) {
      lines.push('- ⚠ Projection exceeds Phase 3 upper bound. Consider Ollama-only routing for remaining ingestion.')
    }
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
    lines.push('## Phase 5 readiness check')
    lines.push(buildGateBlock(gateResult))
    lines.push('')
    lines.push('## Recommendations')
    lines.push(`- Ready for Phase 4 (orchestrator refactor)? ${decisionProceedToPhase4 == null ? 'pending' : (decisionProceedToPhase4 ? 'yes' : 'no')}`)
    lines.push(`- Concept pages confirmed useful in real writing: ${confirmedUsefulInWriting ? 'yes' : 'no'}`)
    if (decisionReasoning) lines.push(`- Reasoning: ${decisionReasoning}`)
    lines.push('')
    lines.push('### User observations')
    lines.push(userObservations || '_(fill in before promoting this report)_')
    lines.push('')

    const markdown = lines.join('\n')
    return {
      markdown,
      aggregate,
      cost,
      coverage,
      coherence,
      progress,
      projection,
      gates: gateResult,
      data,
    }
  }

  async generateAndPersist(args = {}) {
    const result = await this.generate(args)
    await this.adapter.createFolder(WikiPaths.phase3Root)
    let expectedRevision = null
    try {
      expectedRevision = (await this.adapter.getMetadata(WikiPaths.phase3Report)).revision
    } catch (error) {
      if (error?.code !== STORAGE_ERRORS.NOT_FOUND) throw error
    }
    await this.adapter.writeTextIfRevision(WikiPaths.phase3Report, result.markdown, expectedRevision)
    return { ...result, path: WikiPaths.phase3Report }
  }
}

export const PHASE5_GATE_IDS = [
  'gate_paper_count',
  'gate_concept_method_count',
  'gate_broken_links',
  'gate_unsupported_high_impact',
  'gate_manual_claim_verifications',
  'gate_avg_review_time',
  'gate_no_write_conflicts',
  'gate_rag_parity',
  'gate_owner_confirms_useful',
]
