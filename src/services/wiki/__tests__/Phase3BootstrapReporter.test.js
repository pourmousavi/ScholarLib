import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { WikiPaths } from '../WikiPaths'
import { BootstrapPlanService } from '../bootstrap/BootstrapPlanService'
import { BootstrapReporter, checkPhase5Gates, PHASE5_GATE_IDS } from '../bootstrap/BootstrapReporter'
import { LintService } from '../lint/LintService'
import { stringifyWikiMarkdown } from '../WikiMarkdown'

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

async function seedPage(adapter, { id, type, title, body = '' }) {
  const frontmatter = {
    id, handle: id, type, title, aliases: [], tags: [],
    created_at: '2026-04-01T00:00:00.000Z', updated_at: '2026-04-29T00:00:00.000Z',
  }
  const path = WikiPaths.page(id, type, id)
  await adapter.createFolder(WikiPaths.typeRoot(type))
  await adapter.writeTextIfRevision(path, stringifyWikiMarkdown(frontmatter, body), null)
  return path
}

function fakeChecklists(count, { reviewMinutes = 3 } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    paper_id: `p_${i.toString().padStart(2, '0')}`,
    paper_title: `Paper ${i}`,
    ingested_at: new Date(Date.UTC(2026, 3, 1 + i)).toISOString(),
    steps: [
      { name: 'extract', cost_usd: 0.05 },
      { name: 'verify_claims', claims_total: 5, claims_supported: 4, claims_weak: 0, claims_unsupported: 1, cost_usd: 0.02 },
      { name: 'review', duration_seconds_human: reviewMinutes * 60 },
    ],
    schema_issues_observed: [],
    reingestion_required: false,
  }))
}

function checklistService(records) {
  return { listAll: async () => records }
}

function emptyServices() {
  return {
    usefulnessService: { listRatings: async () => [] },
    qualityMetricsService: { listOverrides: async () => [] },
  }
}

describe('checkPhase5Gates', () => {
  it('marks paper-count gate failing when below 25 and trending when between 25 and 30', async () => {
    const sub25 = await checkPhase5Gates({ pagesSidecar: { pages: Array.from({ length: 10 }, (_, i) => ({ id: `p_${i}` })) } })
    const trending = await checkPhase5Gates({ pagesSidecar: { pages: Array.from({ length: 27 }, (_, i) => ({ id: `p_${i}` })) } })
    const passing = await checkPhase5Gates({ pagesSidecar: { pages: Array.from({ length: 31 }, (_, i) => ({ id: `p_${i}` })) } })
    expect(sub25.gates.find((g) => g.id === 'gate_paper_count').status).toBe('fail')
    expect(trending.gates.find((g) => g.id === 'gate_paper_count').status).toBe('trending')
    expect(passing.gates.find((g) => g.id === 'gate_paper_count').status).toBe('pass')
  })

  it('passes write-conflict gate when no recovered safety-mode operations are in last 20', async () => {
    const ops = Array.from({ length: 10 }, (_, i) => ({ id: `op_${i}`, committed_at: new Date(2026, 3, i + 1).toISOString() }))
    const result = await checkPhase5Gates({ pagesSidecar: { pages: [] }, committedOps: ops })
    expect(result.gates.find((g) => g.id === 'gate_no_write_conflicts').status).toBe('pass')
  })

  it('flags unsupported high-impact claims found in page bodies', async () => {
    const pageBodies = new Map([['c_x', [
      'Some text.',
      '```scholarlib-claim',
      'id: cl_high',
      'risk_tier: high',
      'status: unsupported',
      '```',
    ].join('\n')]])
    const result = await checkPhase5Gates({
      pagesSidecar: { pages: [{ id: 'c_x' }] },
      pageBodies,
    })
    const gate = result.gates.find((g) => g.id === 'gate_unsupported_high_impact')
    expect(gate.status).toBe('fail')
    expect(gate.value).toBe(1)
  })

  it('owner-confirms-useful gate passes when ownerConfirmsUseful is true', async () => {
    const result = await checkPhase5Gates({ pagesSidecar: { pages: [] }, ownerConfirmsUseful: true })
    expect(result.gates.find((g) => g.id === 'gate_owner_confirms_useful').status).toBe('pass')
  })

  it('returns the full set of gate ids in expected order', async () => {
    const result = await checkPhase5Gates({ pagesSidecar: { pages: [] } })
    expect(result.gates.map((g) => g.id)).toEqual(PHASE5_GATE_IDS)
  })
})

describe('BootstrapReporter.generateAndPersist', () => {
  it('writes PHASE_3_REPORT.md and includes summary, gates, and quality metrics', async () => {
    const adapter = new MemoryAdapter()
    const planService = new BootstrapPlanService({ adapter })
    await planService.savePlan({
      themes: ['theme-a'],
      own_papers: [
        { scholarlib_doc_id: 'd1', order: 1, theme: 'theme-a', status: 'ingested', paper_page_id: 'p_one' },
      ],
      external_anchors: [],
    })
    await seedPage(adapter, { id: 'p_one', type: 'paper', title: 'Paper One' })
    await seedPagesSidecar(adapter, [{ id: 'p_one', title: 'Paper One', path: WikiPaths.page('p_one', 'paper', 'p_one') }])
    const lintService = new LintService({ adapter })
    const reporter = new BootstrapReporter({
      adapter,
      planService,
      checklistService: checklistService(fakeChecklists(3)),
      lintService,
      ...emptyServices(),
    })
    const result = await reporter.generateAndPersist({
      decisionProceedToPhase4: false,
      confirmedUsefulInWriting: true,
      userObservations: 'Bootstrap proceeded smoothly.',
    })
    expect(result.path).toBe(WikiPaths.phase3Report)
    expect(result.markdown).toContain('# Phase 3 Controlled Bootstrap — Report')
    expect(result.markdown).toContain('## Per-theme structure')
    expect(result.markdown).toContain('## Phase 5 readiness check')
    expect(result.markdown).toContain('Bootstrap proceeded smoothly.')
    expect(result.gates.gates).toHaveLength(9)
    const { text } = await adapter.readTextWithMetadata(WikiPaths.phase3Report)
    expect(text).toContain('# Phase 3 Controlled Bootstrap — Report')
  })

  it('flags over-budget cost projection in the report', async () => {
    const adapter = new MemoryAdapter()
    const planService = new BootstrapPlanService({ adapter })
    await planService.savePlan({
      themes: ['theme-a'],
      own_papers: [
        ...Array.from({ length: 3 }, (_, i) => ({
          scholarlib_doc_id: `d${i}`, order: i + 1, theme: 'theme-a', status: 'ingested', paper_page_id: `p_${i}`,
        })),
        ...Array.from({ length: 27 }, (_, i) => ({
          scholarlib_doc_id: `d${i + 3}`, order: i + 4, theme: 'theme-a', status: 'queued',
        })),
      ],
      external_anchors: [],
    })
    await seedPagesSidecar(adapter, [])
    const expensiveChecklists = Array.from({ length: 3 }, (_, i) => ({
      paper_id: `p_${i}`,
      ingested_at: new Date(Date.UTC(2026, 3, i + 1)).toISOString(),
      steps: [{ name: 'extract', cost_usd: 5 }],
      schema_issues_observed: [],
    }))
    const reporter = new BootstrapReporter({
      adapter,
      planService,
      checklistService: checklistService(expensiveChecklists),
      ...emptyServices(),
    })
    const result = await reporter.generate()
    expect(result.projection.over_budget).toBe(true)
    expect(result.markdown).toContain('Projection exceeds Phase 3 upper bound')
  })
})
