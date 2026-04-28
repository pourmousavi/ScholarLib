import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { BootstrapPlanService } from '../bootstrap/BootstrapPlanService'

function makeService() {
  const adapter = new MemoryAdapter()
  const service = new BootstrapPlanService({ adapter })
  return { adapter, service }
}

describe('BootstrapPlanService', () => {
  it('returns an empty plan when none is persisted', async () => {
    const { service } = makeService()
    const plan = await service.loadPlan()
    expect(plan.own_papers).toEqual([])
    expect(plan.external_anchors).toEqual([])
    expect(plan.themes).toEqual([])
    expect(plan.targets.own_papers.max).toBe(30)
  })

  it('persists and reloads added papers with stable order', async () => {
    const { service } = makeService()
    await service.addPaper('own_papers', 'doc-1', 'calendar-aging', { notes: 'first' })
    await service.addPaper('own_papers', 'doc-2', 'fcas-revenue')
    const reloaded = await service.loadPlan()
    expect(reloaded.own_papers.map((entry) => entry.scholarlib_doc_id)).toEqual(['doc-1', 'doc-2'])
    expect(reloaded.own_papers[0].order).toBe(1)
    expect(reloaded.own_papers[1].order).toBe(2)
    expect(reloaded.themes).toEqual(['calendar-aging', 'fcas-revenue'])
  })

  it('reorders entries deterministically', async () => {
    const { service } = makeService()
    await service.addPaper('own_papers', 'doc-1', 'theme')
    await service.addPaper('own_papers', 'doc-2', 'theme')
    await service.addPaper('own_papers', 'doc-3', 'theme')

    const reordered = await service.reorder('own_papers', 'doc-3', 1)
    expect(reordered.own_papers.map((entry) => entry.scholarlib_doc_id)).toEqual(['doc-3', 'doc-1', 'doc-2'])
    expect(reordered.own_papers.map((entry) => entry.order)).toEqual([1, 2, 3])

    const reloaded = await service.loadPlan()
    expect(reloaded.own_papers.map((entry) => entry.scholarlib_doc_id)).toEqual(['doc-3', 'doc-1', 'doc-2'])
  })

  it('marks a paper ingested and sets paper_page_id', async () => {
    const { service } = makeService()
    await service.addPaper('own_papers', 'doc-1', 'theme')
    await service.markIngested('doc-1', 'p_abc123')
    const status = await service.getIngestionStatus()
    expect(status.own_papers.ingested).toBe(1)
    expect(status.own_papers.queued).toBe(0)
    const plan = await service.loadPlan()
    expect(plan.own_papers[0].paper_page_id).toBe('p_abc123')
    expect(plan.own_papers[0].ingested_at).toBeTruthy()
  })

  it('removes a paper and re-numbers ordering', async () => {
    const { service } = makeService()
    await service.addPaper('own_papers', 'doc-1', 'theme')
    await service.addPaper('own_papers', 'doc-2', 'theme')
    await service.addPaper('own_papers', 'doc-3', 'theme')
    const next = await service.removePaper('own_papers', 'doc-2')
    expect(next.own_papers.map((entry) => entry.scholarlib_doc_id)).toEqual(['doc-1', 'doc-3'])
    expect(next.own_papers.map((entry) => entry.order)).toEqual([1, 2])
  })

  it('refuses external-anchor ingestion until all own-papers are ingested or deferred', async () => {
    const { service } = makeService()
    await service.addPaper('own_papers', 'doc-1', 'theme')
    await service.addPaper('own_papers', 'doc-2', 'theme')
    await service.addPaper('external_anchors', 'doc-anchor', 'theme', { why_anchor: 'foundational' })

    const blocked = await service.canIngestExternal('doc-anchor')
    expect(blocked.allowed).toBe(false)
    expect(blocked.reason).toBe('own_papers_pending')

    await service.markIngested('doc-1', 'p_1')
    const stillBlocked = await service.canIngestExternal('doc-anchor')
    expect(stillBlocked.allowed).toBe(false)

    await service.setStatus('own_papers', 'doc-2', 'deferred')
    const allowed = await service.canIngestExternal('doc-anchor')
    expect(allowed.allowed).toBe(true)
  })

  it('rejects unknown sections, statuses, and missing papers', async () => {
    const { service } = makeService()
    await service.addPaper('own_papers', 'doc-1', 'theme')
    await expect(service.addPaper('mystery_section', 'doc-x')).rejects.toThrow(/Unknown bootstrap section/)
    await expect(service.setStatus('own_papers', 'doc-1', 'invalid')).rejects.toThrow(/Invalid status/)
    await expect(service.removePaper('own_papers', 'missing')).resolves.toBeTruthy()
    await expect(service.markIngested('missing', 'p_x')).rejects.toThrow(/Paper not found/)
  })

  it('records a mid-bootstrap schema revision flag', async () => {
    const { service } = makeService()
    await service.addPaper('own_papers', 'doc-1', 'theme')
    await service.markSchemaRevisionTaken(15)
    const plan = await service.loadPlan()
    expect(plan.schema_revision_taken).toBe(true)
    expect(plan.schema_revision_at_paper).toBe(15)
  })

  it('counts ingested own-papers', async () => {
    const { service } = makeService()
    for (let i = 1; i <= 3; i += 1) await service.addPaper('own_papers', `doc-${i}`, 'theme')
    await service.markIngested('doc-1', 'p_1')
    await service.markIngested('doc-2', 'p_2')
    expect(await service.getOwnPapersIngestedCount()).toBe(2)
  })
})
