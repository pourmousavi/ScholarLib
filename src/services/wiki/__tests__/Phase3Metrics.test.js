import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import {
  computePerThemeCoverage,
  computeCrossPaperCoherence,
  computeBootstrapProgress,
  computeCostProjection,
  aggregatePhase3Metrics,
} from '../phase3/Phase3Metrics'
import { WikiPaths } from '../WikiPaths'

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

async function seedConceptPage(adapter, { id, title, paperRefs = [], claims = 0 }) {
  await adapter.createFolder(WikiPaths.typeRoot('concept'))
  const path = WikiPaths.page(id, 'concept', id)
  const claimBlocks = Array.from({ length: claims }, (_, i) =>
    `\n\`\`\`scholarlib-claim\nid: cl_${i}\nclaim_text: claim ${i}\n\`\`\``).join('\n')
  const refs = paperRefs.map((paperId) => `[[${paperId}]]`).join(' ')
  const text = `---\nid: ${id}\ntitle: ${title}\n---\n\nReferences ${refs}\n${claimBlocks}\n`
  await adapter.writeTextIfRevision(path, text, null)
  return path
}

const PAPER1 = 'p_01HMR5PAPER000000000000001'
const PAPER2 = 'p_01HMR5PAPER000000000000002'
const PAPER3 = 'p_01HMR5PAPER000000000000003'
const PAPER4 = 'p_01HMR5PAPER000000000000004'

describe('computePerThemeCoverage', () => {
  it('counts ingested papers and concept pages per theme', async () => {
    const adapter = new MemoryAdapter()
    const conceptA = await seedConceptPage(adapter, { id: 'c_concept_a', title: 'Concept A', paperRefs: [PAPER1, PAPER2, PAPER3], claims: 4 })
    const conceptB = await seedConceptPage(adapter, { id: 'c_concept_b', title: 'Concept B', paperRefs: [PAPER1], claims: 2 })
    await seedPagesSidecar(adapter, [
      { id: 'c_concept_a', title: 'Concept A', path: conceptA },
      { id: 'c_concept_b', title: 'Concept B', path: conceptB },
    ])

    const plan = {
      themes: ['theme-a', 'theme-b'],
      own_papers: [
        { scholarlib_doc_id: 'd1', theme: 'theme-a', status: 'ingested', paper_page_id: PAPER1 },
        { scholarlib_doc_id: 'd2', theme: 'theme-a', status: 'ingested', paper_page_id: PAPER2 },
        { scholarlib_doc_id: 'd3', theme: 'theme-a', status: 'ingested', paper_page_id: PAPER3 },
        { scholarlib_doc_id: 'd4', theme: 'theme-b', status: 'queued', paper_page_id: null },
      ],
      external_anchors: [],
    }

    const coverage = await computePerThemeCoverage(plan, adapter)
    expect(coverage).toHaveLength(2)
    const themeA = coverage.find((entry) => entry.theme === 'theme-a')
    expect(themeA.papers_ingested).toBe(3)
    expect(themeA.concept_pages).toBe(2)
    expect(themeA.well_supported_concept_pages).toBe(1)

    const themeB = coverage.find((entry) => entry.theme === 'theme-b')
    expect(themeB.papers_ingested).toBe(0)
    expect(themeB.concept_pages).toBe(0)
  })
})

describe('computeCrossPaperCoherence', () => {
  it('returns top-N concepts ranked by supporting paper count', async () => {
    const adapter = new MemoryAdapter()
    const conceptA = await seedConceptPage(adapter, { id: 'c_a', title: 'A', paperRefs: [PAPER1, PAPER2, PAPER3], claims: 6 })
    const conceptB = await seedConceptPage(adapter, { id: 'c_b', title: 'B', paperRefs: [PAPER1], claims: 1 })
    const conceptC = await seedConceptPage(adapter, { id: 'c_c', title: 'C', paperRefs: [PAPER1, PAPER2], claims: 3 })
    await seedPagesSidecar(adapter, [
      { id: 'c_a', title: 'A', path: conceptA },
      { id: 'c_b', title: 'B', path: conceptB },
      { id: 'c_c', title: 'C', path: conceptC },
    ])

    const result = await computeCrossPaperCoherence(adapter, { topN: 10 })
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0].page_id).toBe('c_a')
    expect(result.entries[0].supporting_papers).toBe(3)
    expect(result.average_supporting_papers).toBeCloseTo(2)
    expect(result.stddev_claim_count).toBeGreaterThan(0)
  })

  it('returns zeros when no concept pages exist', async () => {
    const adapter = new MemoryAdapter()
    await seedPagesSidecar(adapter, [])
    const result = await computeCrossPaperCoherence(adapter)
    expect(result.entries).toEqual([])
    expect(result.stddev_claim_count).toBe(0)
  })
})

describe('computeBootstrapProgress', () => {
  it('summarises plan totals and statuses', () => {
    const plan = {
      own_papers: [
        { status: 'queued' }, { status: 'in_progress' }, { status: 'ingested' },
      ],
      external_anchors: [
        { status: 'ingested' }, { status: 'deferred' },
      ],
      targets: { own_papers: { min: 25, max: 30 }, external_anchors: { min: 10, max: 15 } },
    }
    const progress = computeBootstrapProgress(plan)
    expect(progress.own_papers.total).toBe(3)
    expect(progress.own_papers.ingested).toBe(1)
    expect(progress.external_anchors.deferred).toBe(1)
  })
})

describe('computeCostProjection', () => {
  it('extrapolates spend from running average', () => {
    const checklists = [
      { steps: [{ name: 'extract', cost_usd: 0.10 }, { name: 'verify_claims', cost_usd: 0.05 }] },
      { steps: [{ name: 'extract', cost_usd: 0.20 }, { name: 'verify_claims', cost_usd: 0.05 }] },
    ]
    const plan = {
      own_papers: [
        { status: 'ingested' }, { status: 'ingested' }, { status: 'queued' }, { status: 'queued' },
      ],
      external_anchors: [
        { status: 'queued' },
      ],
    }
    const projection = computeCostProjection(checklists, plan)
    expect(projection.spent_usd).toBeCloseTo(0.40, 5)
    expect(projection.average_per_paper_usd).toBeCloseTo(0.20, 5)
    expect(projection.remaining_papers).toBe(3)
    expect(projection.projected_remaining_usd).toBeCloseTo(0.60, 5)
    expect(projection.projected_total_usd).toBeCloseTo(1.00, 5)
    expect(projection.over_budget).toBe(false)
  })

  it('flags projection that exceeds the upper bound', () => {
    const checklists = Array.from({ length: 3 }, () => ({ steps: [{ name: 'extract', cost_usd: 5 }] }))
    const plan = {
      own_papers: [
        ...Array.from({ length: 3 }, () => ({ status: 'ingested' })),
        ...Array.from({ length: 27 }, () => ({ status: 'queued' })),
      ],
      external_anchors: [],
    }
    const projection = computeCostProjection(checklists, plan)
    expect(projection.over_budget).toBe(true)
  })
})

describe('aggregatePhase3Metrics', () => {
  it('uses the tighter Phase 3 thresholds', () => {
    const checklists = [
      {
        ingested_at: '2026-04-28T00:00:00Z',
        steps: [
          { name: 'verify_claims', claims_total: 10, claims_supported: 9, claims_weak: 1, claims_unsupported: 0 },
          { name: 'review', duration_seconds_human: 4 * 60 + 5 },
        ],
      },
    ]
    const aggregate = aggregatePhase3Metrics({ checklists })
    expect(aggregate.metrics.average_review_minutes.threshold.value).toBe(4)
    expect(aggregate.metrics.high_impact_claim_rejection_rate.threshold.value).toBe(0.15)
    expect(aggregate.metrics.average_review_minutes.status).toBe('red')
  })
})
