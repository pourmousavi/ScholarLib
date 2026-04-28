import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { IngestionChecklistService, createChecklistRecord } from '../phase1/IngestionChecklistService'
import { QualityMetricsService } from '../phase1/QualityMetrics'
import { UsefulnessService } from '../phase1/UsefulnessService'
import { Phase1Reporter } from '../phase1/Phase1Reporter'
import { WikiPaths } from '../WikiPaths'

function fakeChecklist(index, overrides = {}) {
  const checklist = createChecklistRecord({
    paperId: `p_${index}`,
    scholarlibDocId: `d${index}`,
    paperTitle: `Paper ${index}`,
    ingestedAt: `2026-04-${String(index).padStart(2, '0')}T00:00:00Z`,
  })
  IngestionChecklistService.succeedStep(checklist, 'extract', { duration_seconds: 5, cost_usd: 0 })
  IngestionChecklistService.succeedStep(checklist, 'verify_claims', {
    claims_total: 4,
    claims_supported: 4,
    claims_weak: 0,
    claims_unsupported: 0,
    cost_usd: 0.04,
  })
  IngestionChecklistService.succeedStep(checklist, 'build_proposal', { page_changes_count: 1 })
  IngestionChecklistService.succeedStep(checklist, 'review', { duration_seconds_human: 240, changes_approved: 1 })
  IngestionChecklistService.succeedStep(checklist, 'apply', { op_id: 'op_x' })
  IngestionChecklistService.succeedStep(checklist, 'sidecar_regen', { duration_seconds: 0.4 })
  IngestionChecklistService.recordObservations(checklist, '', overrides.schemaIssues || [], false)
  return checklist
}

async function seedAdapter() {
  const adapter = new MemoryAdapter()
  const checklistService = new IngestionChecklistService({ adapter })
  for (let i = 1; i <= 10; i++) {
    await checklistService.save(fakeChecklist(i, { schemaIssues: i % 5 === 0 ? ['verifier_overzealous'] : [] }))
  }
  const usefulnessService = new UsefulnessService({ adapter })
  for (const checkpoint of [3, 5, 7, 10]) {
    await usefulnessService.recordRating({ rating: 4, paperIndex: checkpoint })
  }
  const qualityMetrics = new QualityMetricsService({ adapter })
  await qualityMetrics.logOverride({ reason: 'Acceptable for trial', metric: 'manual_cleanup_rate', value: 0.05, paper_index: 6 })
  return { adapter, checklistService, usefulnessService, qualityMetrics }
}

describe('Phase1Reporter', () => {
  it('produces a populated report from a synthetic 10-paper run', async () => {
    const { adapter, checklistService, usefulnessService, qualityMetrics } = await seedAdapter()
    const reporter = new Phase1Reporter({
      adapter,
      checklistService,
      usefulnessService,
      positionDraftGenerator: { listReviews: vi.fn().mockResolvedValue([{ user_rating: 3, would_edit_to_keep: 'partially' }]) },
      qualityMetricsService: qualityMetrics,
      schemaMigrations: [{ migration_id: '1_0_to_1_1', is_breaking: true }],
    })

    const result = await reporter.generate({
      outcome: 'completed',
      decisionProceedToPhase2: true,
      decisionReasoning: 'Concept pages saved time during the SAREN draft.',
      userRecommendations: 'Tighten verifier prompt; add `disclaimer:` field to position frontmatter.',
      manualCleanupCount: 1,
      confirmedUsefulInWriting: true,
    })

    expect(result.markdown).toMatch(/# Phase 1 Schema Trial — Report/)
    expect(result.markdown).toMatch(/Papers ingested: 10/)
    expect(result.markdown).toMatch(/Per-paper history/)
    expect(result.markdown).toMatch(/verifier_overzealous \(×2\)/)
    expect(result.markdown).toMatch(/Drafts generated: 1/)
    expect(result.markdown).toMatch(/Acceptable for trial/)
    expect(result.markdown).toMatch(/Proceed to Phase 2: yes/)
    expect(result.markdown).toMatch(/Tighten verifier prompt/)
    expect(result.markdown).toMatch(/Concept pages confirmed useful in real writing: yes/)
  })

  it('persists the report to PHASE_1_REPORT.md and overwrites on regeneration', async () => {
    const { adapter, checklistService, usefulnessService, qualityMetrics } = await seedAdapter()
    const reporter = new Phase1Reporter({
      adapter,
      checklistService,
      usefulnessService,
      positionDraftGenerator: { listReviews: vi.fn().mockResolvedValue([]) },
      qualityMetricsService: qualityMetrics,
      schemaMigrations: [],
    })
    await reporter.generateAndPersist({ outcome: 'completed', confirmedUsefulInWriting: true })
    const first = await adapter.readTextWithMetadata(WikiPaths.phase1Report)
    expect(first.text).toMatch(/Phase 1 Schema Trial/)

    await reporter.generateAndPersist({ outcome: 'completed', confirmedUsefulInWriting: true, decisionReasoning: 'updated note' })
    const second = await adapter.readTextWithMetadata(WikiPaths.phase1Report)
    expect(second.text).toMatch(/updated note/)
  })

  it('falls through cleanly when there are no checklists or ratings', async () => {
    const adapter = new MemoryAdapter()
    const reporter = new Phase1Reporter({
      adapter,
      checklistService: new IngestionChecklistService({ adapter }),
      usefulnessService: new UsefulnessService({ adapter }),
      positionDraftGenerator: { listReviews: vi.fn().mockResolvedValue([]) },
      qualityMetricsService: new QualityMetricsService({ adapter }),
      schemaMigrations: [],
    })
    const result = await reporter.generate({ outcome: 'abandoned', abandonedAtPaper: 2 })
    expect(result.markdown).toMatch(/Outcome: abandoned-at-paper-2/)
    expect(result.markdown).toMatch(/_No papers ingested._/)
    expect(result.markdown).toMatch(/_No position drafts reviewed._/)
  })
})
