import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { IngestionChecklistService, createChecklistRecord } from '../phase1/IngestionChecklistService'
import {
  QualityMetricsService,
  aggregateMetrics,
  detectThresholdViolations,
  summariseCosts,
} from '../phase1/QualityMetrics'

function buildChecklist({ index, total, supported, weak, unsupported, reviewSeconds, schemaIssues = [], cost = 0 }) {
  const checklist = createChecklistRecord({
    paperId: `p_${index}`,
    scholarlibDocId: `d${index}`,
    paperTitle: `Paper ${index}`,
    ingestedAt: `2026-04-${String(index + 1).padStart(2, '0')}T01:00:00Z`,
  })
  IngestionChecklistService.succeedStep(checklist, 'extract', { duration_seconds: 5, cost_usd: cost })
  IngestionChecklistService.succeedStep(checklist, 'verify_claims', {
    claims_total: total,
    claims_supported: supported,
    claims_weak: weak,
    claims_unsupported: unsupported,
    cost_usd: 0,
  })
  IngestionChecklistService.succeedStep(checklist, 'build_proposal', { page_changes_count: 1 })
  IngestionChecklistService.succeedStep(checklist, 'review', {
    duration_seconds_human: reviewSeconds,
    changes_approved: 1,
  })
  IngestionChecklistService.succeedStep(checklist, 'apply', { op_id: 'op_x' })
  IngestionChecklistService.succeedStep(checklist, 'sidecar_regen', { duration_seconds: 0.4 })
  IngestionChecklistService.recordObservations(checklist, '', schemaIssues, false)
  return checklist
}

describe('QualityMetrics aggregator', () => {
  it('computes green metrics for a healthy small batch', () => {
    const checklists = [
      buildChecklist({ index: 1, total: 4, supported: 4, weak: 0, unsupported: 0, reviewSeconds: 240 }),
      buildChecklist({ index: 2, total: 5, supported: 4, weak: 1, unsupported: 0, reviewSeconds: 360 }),
    ]
    const usefulnessRatings = [{ rating: 4 }, { rating: 5 }]
    const aggregate = aggregateMetrics({ checklists, usefulnessRatings })

    expect(aggregate.metrics.high_impact_claim_rejection_rate.value).toBeCloseTo(1 / 9, 6)
    expect(aggregate.metrics.high_impact_claim_rejection_rate.status).toBe('green')
    expect(aggregate.metrics.average_review_minutes.value).toBeCloseTo(5, 6)
    expect(aggregate.metrics.average_review_minutes.status).toBe('green')
    expect(aggregate.metrics.concept_page_usefulness_average.value).toBeCloseTo(4.5, 6)
    expect(aggregate.metrics.concept_page_usefulness_average.status).toBe('green')
    expect(detectThresholdViolations(aggregate.metrics)).toHaveLength(0)
  })

  it('detects threshold crossing when claim rejection rate exceeds 20 percent', () => {
    const checklists = [
      buildChecklist({ index: 1, total: 5, supported: 1, weak: 2, unsupported: 2, reviewSeconds: 240 }),
      buildChecklist({ index: 2, total: 5, supported: 2, weak: 2, unsupported: 1, reviewSeconds: 240 }),
    ]
    const aggregate = aggregateMetrics({ checklists })
    expect(aggregate.metrics.high_impact_claim_rejection_rate.value).toBeCloseTo(7 / 10, 6)
    expect(aggregate.metrics.high_impact_claim_rejection_rate.status).toBe('red')
    const violations = detectThresholdViolations(aggregate.metrics)
    expect(violations.find((entry) => entry.metric === 'high_impact_claim_rejection_rate')).toBeTruthy()
  })

  it('summarises Phase 1 spend and projects steady state cost', () => {
    const checklists = [
      buildChecklist({ index: 1, total: 4, supported: 4, weak: 0, unsupported: 0, reviewSeconds: 240, cost: 0.05 }),
      buildChecklist({ index: 2, total: 4, supported: 4, weak: 0, unsupported: 0, reviewSeconds: 240, cost: 0.10 }),
    ]
    const cost = summariseCosts(checklists)
    expect(cost.extract).toBeCloseTo(0.15, 6)
    expect(cost.total).toBeCloseTo(0.15, 6)
    expect(cost.projected_steady_state_usd).toBeCloseTo(0.75, 6)
  })

  it('tracks trend over the last five papers separately from cumulative value', () => {
    const checklists = []
    for (let i = 1; i <= 7; i++) {
      const recent = i > 5
      checklists.push(buildChecklist({
        index: i,
        total: 5,
        supported: recent ? 0 : 5,
        weak: recent ? 5 : 0,
        unsupported: 0,
        reviewSeconds: 240,
      }))
    }
    const aggregate = aggregateMetrics({ checklists })
    expect(aggregate.metrics.high_impact_claim_rejection_rate.trend).toBeGreaterThan(aggregate.metrics.high_impact_claim_rejection_rate.value)
  })

  it('logs and lists overrides through QualityMetricsService', async () => {
    const adapter = new MemoryAdapter()
    const service = new QualityMetricsService({ adapter })
    const record = await service.logOverride({
      reason: 'Verifier mis-classifying obvious claims; willing to absorb signal',
      metric: 'high_impact_claim_rejection_rate',
      value: 0.4,
      paper_index: 4,
    })
    expect(record.id).toBeTruthy()
    expect(record.reason).toMatch(/mis-classifying/)
    const list = await service.listOverrides()
    expect(list).toHaveLength(1)
    expect(list[0].metric).toBe('high_impact_claim_rejection_rate')
  })
})
