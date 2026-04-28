import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { WikiPaths } from '../WikiPaths'
import { BootstrapPlanService } from '../bootstrap/BootstrapPlanService'
import { BootstrapContext } from '../bootstrap/BootstrapContext'
import {
  computePerThemeCoverage,
  computeBootstrapProgress,
  computeCostProjection,
} from '../phase3/Phase3Metrics'
import { aggregateMetrics, PHASE3_QUALITY_THRESHOLDS, detectThresholdViolations } from '../phase1/QualityMetrics'
import { LintService } from '../lint/LintService'
import { LintScheduler } from '../lint/LintScheduler'
import { BootstrapReporter, checkPhase5Gates } from '../bootstrap/BootstrapReporter'
import { stringifyWikiMarkdown } from '../WikiMarkdown'

const PAPER_ID_PREFIX = 'p_01HMR5SEQ0000000000000000'
const CONCEPT_ID_PREFIX = 'c_01HMR5CPT0000000000000000'

function paperId(n) { return `${PAPER_ID_PREFIX}${String(n).padStart(2, '0')}` }
function conceptId(n) { return `${CONCEPT_ID_PREFIX}${String(n).padStart(2, '0')}` }

async function seedPage(adapter, { id, type, title, body = '', updatedAt = null }) {
  const frontmatter = {
    id, handle: id, type, title, aliases: [], tags: [],
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: updatedAt || new Date().toISOString(),
  }
  const path = WikiPaths.page(id, type, id)
  await adapter.createFolder(WikiPaths.typeRoot(type))
  await adapter.writeTextIfRevision(path, stringifyWikiMarkdown(frontmatter, body), null)
  return path
}

async function seedPagesSidecar(adapter, pages) {
  await adapter.createFolder(WikiPaths.systemRoot)
  await adapter.writeJSON(WikiPaths.pagesSidecar, {
    version: '0A',
    generated_at: new Date().toISOString(),
    count: pages.length,
    pages,
    hash: 'sha256:test',
  })
}

function fakeLibrary(docIds) {
  const documents = {}
  for (const id of docIds) {
    documents[id] = { id, metadata: { title: `Doc ${id}` } }
  }
  return { documents }
}

function makeChecklist({ id, ingestedAt, reviewMinutes = 3, claimsTotal = 5, weak = 0, unsupported = 0, costPerStep = 0.05 }) {
  return {
    paper_id: id,
    ingested_at: ingestedAt,
    steps: [
      { name: 'extract', cost_usd: costPerStep },
      { name: 'verify_claims', claims_total: claimsTotal, claims_supported: claimsTotal - weak - unsupported, claims_weak: weak, claims_unsupported: unsupported, cost_usd: costPerStep / 2 },
      { name: 'review', duration_seconds_human: reviewMinutes * 60 },
    ],
    schema_issues_observed: [],
    reingestion_required: false,
  }
}

const checklistService = (records) => ({ listAll: async () => records })

describe('Phase 3 controlled bootstrap end-to-end scenarios', () => {
  it('cold start — user records a new plan with 5 own-papers and 2 external anchors', async () => {
    const adapter = new MemoryAdapter()
    const planService = new BootstrapPlanService({ adapter })
    for (let i = 0; i < 5; i++) {
      await planService.addPaper('own_papers', `own-${i}`, 'theme-a')
    }
    await planService.addPaper('external_anchors', 'anchor-1', 'theme-a', { why_anchor: 'foundational' })
    await planService.addPaper('external_anchors', 'anchor-2', 'theme-a', { why_anchor: 'broad survey' })
    const status = await planService.getIngestionStatus()
    expect(status.own_papers.total).toBe(5)
    expect(status.external_anchors.total).toBe(2)
    expect(status.themes).toContain('theme-a')
  })

  it('sequential ingestion — status tracking, per-theme coverage, cost projection update over time', async () => {
    const adapter = new MemoryAdapter()
    const planService = new BootstrapPlanService({ adapter })
    for (let i = 0; i < 3; i++) {
      await planService.addPaper('own_papers', `doc-${i}`, 'theme-a')
    }
    const checklists = []
    for (let i = 0; i < 3; i++) {
      const id = paperId(i)
      await seedPage(adapter, { id, type: 'paper', title: `Paper ${i}`, body: `Refers to [[${conceptId(0)}]]` })
      await planService.markIngested(`doc-${i}`, id)
      checklists.push(makeChecklist({ id, ingestedAt: new Date(Date.UTC(2026, 3, i + 1)).toISOString() }))
    }
    await seedPage(adapter, { id: conceptId(0), type: 'concept', title: 'Concept Zero', body: `Supported by [[${paperId(0)}]] [[${paperId(1)}]] [[${paperId(2)}]]` })
    await seedPagesSidecar(adapter, [
      ...Array.from({ length: 3 }, (_, i) => ({ id: paperId(i), title: `Paper ${i}`, path: WikiPaths.page(paperId(i), 'paper', paperId(i)) })),
      { id: conceptId(0), title: 'Concept Zero', path: WikiPaths.page(conceptId(0), 'concept', conceptId(0)) },
    ])
    const plan = await planService.loadPlan()
    const coverage = await computePerThemeCoverage(plan, adapter)
    expect(coverage[0].papers_ingested).toBe(3)
    expect(coverage[0].concept_pages).toBe(1)
    expect(coverage[0].well_supported_concept_pages).toBe(1)
    const projection = computeCostProjection(checklists, plan)
    expect(projection.spent_usd).toBeGreaterThan(0)
  })

  it('first-in-theme directive present on first paper, subsequent directive on later paper', async () => {
    const adapter = new MemoryAdapter()
    const planService = new BootstrapPlanService({ adapter })
    await planService.addPaper('own_papers', 'doc-first', 'theme-a')
    await planService.addPaper('own_papers', 'doc-second', 'theme-a')

    const ctx = new BootstrapContext({ adapter })
    let plan = await planService.loadPlan()
    const firstCtx = await ctx.buildContext('doc-first', fakeLibrary(['doc-first']), plan)
    expect(firstCtx.bootstrap_position).toBe('first_in_theme')
    expect(BootstrapContext.directiveFor(firstCtx)).toContain('opens the theme')

    await seedPage(adapter, { id: paperId(0), type: 'paper', title: 'Paper 0' })
    await seedPagesSidecar(adapter, [{ id: paperId(0), title: 'Paper 0', path: WikiPaths.page(paperId(0), 'paper', paperId(0)) }])
    await planService.markIngested('doc-first', paperId(0))
    plan = await planService.loadPlan()
    const subsequentCtx = await ctx.buildContext('doc-second', fakeLibrary(['doc-second']), plan)
    expect(subsequentCtx.bootstrap_position).toBe('subsequent_in_theme')
    expect(BootstrapContext.directiveFor(subsequentCtx)).toContain('Concept pages exist')
  })

  it('external anchors get conservative-on-new-concepts directive after own-papers ingested', async () => {
    const adapter = new MemoryAdapter()
    const planService = new BootstrapPlanService({ adapter })
    await planService.addPaper('own_papers', 'own-1', 'theme-a')
    await planService.addPaper('external_anchors', 'anchor-1', 'theme-a', { why_anchor: 'foundational' })
    await seedPage(adapter, { id: paperId(0), type: 'paper', title: 'Own One' })
    await seedPagesSidecar(adapter, [{ id: paperId(0), title: 'Own One', path: WikiPaths.page(paperId(0), 'paper', paperId(0)) }])
    await planService.markIngested('own-1', paperId(0))
    const plan = await planService.loadPlan()
    const ctx = new BootstrapContext({ adapter })
    const anchorCtx = await ctx.buildContext('anchor-1', fakeLibrary(['anchor-1']), plan)
    expect(anchorCtx.bootstrap_position).toBe('external_anchor')
    expect(BootstrapContext.directiveFor(anchorCtx)).toContain('conservative')
  })

  it('quality dashboard threshold trip — high-impact rejection above 15% surfaces a violation', async () => {
    const checklists = [
      makeChecklist({ id: paperId(0), ingestedAt: '2026-04-01T00:00:00Z', claimsTotal: 100, weak: 0, unsupported: 18 }),
    ]
    const aggregate = aggregateMetrics({ checklists, thresholds: PHASE3_QUALITY_THRESHOLDS })
    const violations = detectThresholdViolations(aggregate.metrics)
    expect(violations.find((v) => v.metric === 'high_impact_claim_rejection_rate')).toBeTruthy()
  })

  it('mid-bootstrap migration — markSchemaRevisionTaken closes the one-shot opportunity', async () => {
    const adapter = new MemoryAdapter()
    const planService = new BootstrapPlanService({ adapter })
    for (let i = 0; i < 15; i++) {
      await planService.addPaper('own_papers', `doc-${i}`, 'theme-a')
      await planService.setStatus('own_papers', `doc-${i}`, 'ingested')
    }
    expect(await planService.getOwnPapersIngestedCount()).toBe(15)
    let plan = await planService.loadPlan()
    expect(plan.schema_revision_taken).toBe(false)
    await planService.markSchemaRevisionTaken(15)
    plan = await planService.loadPlan()
    expect(plan.schema_revision_taken).toBe(true)
    expect(plan.schema_revision_at_paper).toBe(15)
  })

  it('lint scheduler runs after every 5 ingestions and persists state', async () => {
    const adapter = new MemoryAdapter()
    const lintService = new LintService({ adapter })
    const scheduler = new LintScheduler({
      adapter,
      lintService,
      options: { ingestion_interval: 5 },
      now: () => new Date('2026-04-29T00:00:00.000Z'),
    })
    expect(await scheduler.runIfDueAfterIngestion(3)).toBeNull()
    const fifth = await scheduler.runIfDueAfterIngestion(5)
    expect(fifth).toBeTruthy()
    expect(fifth.run.trigger).toBe('ingestion')
    const state = await scheduler.loadState()
    expect(state.runs).toHaveLength(1)
    const tenth = await scheduler.runIfDueAfterIngestion(10)
    expect(tenth).toBeTruthy()
  })

  it('bootstrap completion report — generates from synthetic plan + sidecar with full metrics', async () => {
    const adapter = new MemoryAdapter()
    const planService = new BootstrapPlanService({ adapter })
    await planService.savePlan({
      themes: ['theme-a'],
      own_papers: [
        { scholarlib_doc_id: 'd1', order: 1, theme: 'theme-a', status: 'ingested', paper_page_id: paperId(0) },
        { scholarlib_doc_id: 'd2', order: 2, theme: 'theme-a', status: 'ingested', paper_page_id: paperId(1) },
      ],
      external_anchors: [],
    })
    await seedPage(adapter, { id: paperId(0), type: 'paper', title: 'Paper Zero' })
    await seedPage(adapter, { id: paperId(1), type: 'paper', title: 'Paper One' })
    await seedPagesSidecar(adapter, [
      { id: paperId(0), title: 'Paper Zero', path: WikiPaths.page(paperId(0), 'paper', paperId(0)) },
      { id: paperId(1), title: 'Paper One', path: WikiPaths.page(paperId(1), 'paper', paperId(1)) },
    ])
    const checklists = [
      makeChecklist({ id: paperId(0), ingestedAt: '2026-04-01T00:00:00Z' }),
      makeChecklist({ id: paperId(1), ingestedAt: '2026-04-02T00:00:00Z' }),
    ]
    const reporter = new BootstrapReporter({
      adapter,
      planService,
      checklistService: checklistService(checklists),
      usefulnessService: { listRatings: async () => [] },
      qualityMetricsService: { listOverrides: async () => [] },
      lintService: new LintService({ adapter }),
    })
    const result = await reporter.generateAndPersist({
      decisionProceedToPhase4: true,
      confirmedUsefulInWriting: true,
      userObservations: 'Successful bootstrap.',
    })
    expect(result.path).toBe(WikiPaths.phase3Report)
    expect(result.markdown).toContain('Phase 3 Controlled Bootstrap')
    expect(result.markdown).toContain('Phase 5 readiness check')
    expect(result.gates.gates).toHaveLength(9)
  })

  it('Phase 5 readiness — synthetic state matching all gates returns 9 of 9 passing', async () => {
    const pages = [
      ...Array.from({ length: 31 }, (_, i) => ({ id: `p_${String(i).padStart(26, '0')}` })),
      ...Array.from({ length: 9 }, (_, i) => ({ id: `c_${String(i).padStart(26, '0')}` })),
    ]
    const sortedReviews = Array.from({ length: 10 }, (_, i) => makeChecklist({
      id: `p_review_${i}`, ingestedAt: new Date(2026, 3, i + 1).toISOString(), reviewMinutes: 3,
    }))
    const ops = Array.from({ length: 20 }, (_, i) => ({ id: `op_${i}`, committed_at: new Date(2026, 3, i + 1).toISOString() }))
    const result = await checkPhase5Gates({
      pagesSidecar: { pages },
      lintResult: { findings: [], summary: { total: 0, by_rule: {}, by_severity: {} } },
      checklists: sortedReviews,
      committedOps: ops,
      manualClaimVerifications: Array.from({ length: 21 }, (_, i) => ({ claim_id: `cl_${i}` })),
      ragParityPassing: true,
      ownerConfirmsUseful: true,
    })
    expect(result.summary.pass).toBe(9)
    expect(result.summary.fail).toBe(0)
  })

  it('cost discipline — runaway spend produces over_budget projection', async () => {
    const checklists = Array.from({ length: 3 }, (_, i) => ({
      paper_id: paperId(i),
      ingested_at: new Date(Date.UTC(2026, 3, i + 1)).toISOString(),
      steps: [{ name: 'extract', cost_usd: 5 }],
      schema_issues_observed: [],
    }))
    const plan = {
      own_papers: [
        ...Array.from({ length: 3 }, (_, i) => ({ scholarlib_doc_id: `d${i}`, status: 'ingested' })),
        ...Array.from({ length: 27 }, (_, i) => ({ scholarlib_doc_id: `d${i + 3}`, status: 'queued' })),
      ],
      external_anchors: [],
    }
    const projection = computeCostProjection(checklists, plan)
    expect(projection.over_budget).toBe(true)
    expect(projection.projected_total_usd).toBeGreaterThan(projection.projection_upper_bound_usd)
  })

  it('bootstrap progress reflects mixed status counts including deferred entries', () => {
    const plan = {
      own_papers: [
        { status: 'queued' }, { status: 'in_progress' }, { status: 'ingested' }, { status: 'deferred' },
      ],
      external_anchors: [
        { status: 'ingested' }, { status: 'ingested' }, { status: 'queued' },
      ],
    }
    const progress = computeBootstrapProgress(plan)
    expect(progress.own_papers.total).toBe(4)
    expect(progress.own_papers.deferred).toBe(1)
    expect(progress.external_anchors.ingested).toBe(2)
  })
})
