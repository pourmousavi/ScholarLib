import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { PageStore } from '../PageStore'
import { WikiPaths } from '../WikiPaths'
import { stringifyWikiMarkdown } from '../WikiMarkdown'
import { LintService, LINT_RULES } from '../lint/LintService'
import { LintScheduler } from '../lint/LintScheduler'
import { hashMarkdown } from '../WikiHash'

async function seedPage(adapter, { id, type, title, body = '', updatedAt = null, aliases = [] }) {
  const frontmatter = {
    id,
    handle: id,
    type,
    title,
    aliases,
    tags: [],
    created_at: updatedAt || new Date().toISOString(),
    updated_at: updatedAt || new Date().toISOString(),
  }
  const text = stringifyWikiMarkdown(frontmatter, body)
  const path = WikiPaths.page(id, type, id)
  await adapter.createFolder(WikiPaths.typeRoot(type))
  await adapter.writeTextIfRevision(path, text, null)
  return path
}

async function seedAliasesSidecar(adapter, conflicts) {
  await adapter.createFolder(WikiPaths.systemRoot)
  await adapter.writeJSON(WikiPaths.aliasesSidecar, {
    version: '0A',
    generated_at: new Date().toISOString(),
    aliases: {},
    conflicts,
    hash: 'sha256:test',
  })
}

describe('LintService rules', () => {
  it('flags stale paper pages and stale position pages independently', async () => {
    const adapter = new MemoryAdapter()
    const oldDate = '2024-01-01T00:00:00.000Z'
    await seedPage(adapter, { id: 'p_old', type: 'paper', title: 'Old Paper', updatedAt: oldDate })
    await seedPage(adapter, { id: 'po_old', type: 'position_draft', title: 'Old Position', updatedAt: oldDate })
    const service = new LintService({ adapter, now: () => new Date('2026-04-29T00:00:00.000Z') })
    const result = await service.runAll()
    const stalePapers = result.findings.filter((f) => f.rule === 'stale_pages')
    const staleDrafts = result.findings.filter((f) => f.rule === 'stale_position_pages')
    expect(stalePapers).toHaveLength(1)
    expect(stalePapers[0].page_id).toBe('p_old')
    expect(staleDrafts).toHaveLength(1)
    expect(staleDrafts[0].page_id).toBe('po_old')
  })

  it('flags orphan concept pages and ignores orphan paper pages', async () => {
    const adapter = new MemoryAdapter()
    await seedPage(adapter, { id: 'p_lonely', type: 'paper', title: 'Lonely Paper' })
    await seedPage(adapter, { id: 'c_orphan', type: 'concept', title: 'Orphan Concept' })
    await seedPage(adapter, { id: 'c_linked', type: 'concept', title: 'Linked Concept' })
    await seedPage(adapter, {
      id: 'p_referrer',
      type: 'paper',
      title: 'Referrer',
      body: 'Refers to [[c_linked]].',
    })
    const service = new LintService({ adapter })
    const result = await service.runAll({ rules: ['orphan_pages'] })
    const ids = result.findings.map((f) => f.page_id)
    expect(ids).toContain('c_orphan')
    expect(ids).not.toContain('c_linked')
    expect(ids).not.toContain('p_lonely')
  })

  it('flags broken wikilinks and aggregates ingestion debt', async () => {
    const adapter = new MemoryAdapter()
    await seedPage(adapter, { id: 'p_one', type: 'paper', title: 'One', body: 'Refers to [[Missing Concept]].' })
    await seedPage(adapter, { id: 'p_two', type: 'paper', title: 'Two', body: 'Refers to [[Missing Concept]].' })
    await seedPage(adapter, { id: 'p_three', type: 'paper', title: 'Three', body: 'Refers to [[Missing Concept]].' })
    const service = new LintService({ adapter })
    const result = await service.runAll({ rules: ['broken_wikilinks', 'ingestion_debt'] })
    expect(result.findings.find((f) => f.rule === 'broken_wikilinks')).toBeTruthy()
    const debt = result.findings.find((f) => f.rule === 'ingestion_debt')
    expect(debt).toBeTruthy()
    expect(debt.details.source_count).toBeGreaterThanOrEqual(3)
  })

  it('surfaces alias collisions from the aliases sidecar', async () => {
    const adapter = new MemoryAdapter()
    await seedPage(adapter, { id: 'c_a', type: 'concept', title: 'Concept A' })
    await seedAliasesSidecar(adapter, [{ alias: 'Concept A', page_ids: ['c_a', 'c_b'] }])
    const service = new LintService({ adapter })
    const result = await service.runAll({ rules: ['alias_collisions'] })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('high')
  })

  it('flags claims marked contested', async () => {
    const adapter = new MemoryAdapter()
    const body = [
      'Some intro.',
      '```scholarlib-claim',
      'id: cl_1',
      'claim_text: a contested claim',
      'status: contested',
      '```',
    ].join('\n')
    await seedPage(adapter, { id: 'c_claim', type: 'concept', title: 'Concept', body })
    const service = new LintService({ adapter })
    const result = await service.runAll({ rules: ['contested_claims'] })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].details.claim_id).toBe('cl_1')
  })

  it('flags stale evidence locators when page_text_hash mismatches', async () => {
    const adapter = new MemoryAdapter()
    const body = [
      'Page body content here.',
      '```scholarlib-claim',
      'id: cl_99',
      'claim_text: Evidence drift example',
      'evidence:',
      '  pdf_page: 1',
      '  char_start: 0',
      '  char_end: 10',
      '  page_text_hash: sha256:stale-hash-value-123',
      '```',
    ].join('\n')
    await seedPage(adapter, { id: 'c_drift', type: 'concept', title: 'Drift', body })
    const service = new LintService({ adapter })
    const result = await service.runAll({ rules: ['stale_evidence_locators'] })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].details.claim_id).toBe('cl_99')
  })

  it('does not flag stale evidence when claim-stripped page hash matches stored hash', async () => {
    const adapter = new MemoryAdapter()
    const surroundingText = 'Page body content.'
    const expectedHash = await hashMarkdown(surroundingText)
    const body = [
      surroundingText,
      '```scholarlib-claim',
      'id: cl_match',
      'claim_text: Matched evidence',
      'evidence:',
      `  page_text_hash: ${expectedHash}`,
      '```',
    ].join('\n')
    await seedPage(adapter, { id: 'c_match', type: 'concept', title: 'Match', body })
    const service = new LintService({ adapter })
    const result = await service.runAll({ rules: ['stale_evidence_locators'] })
    expect(result.findings).toHaveLength(0)
  })

  it('flags malformed op files and old pending op recovery debt', async () => {
    const adapter = new MemoryAdapter()
    await adapter.createFolder(WikiPaths.opMonthRoot(new Date()))
    const malformedPath = `${WikiPaths.opMonthRoot(new Date())}/op_BAD.committed.json`
    await adapter.writeTextIfRevision(malformedPath, '{not json', null)

    const oldPendingPath = `${WikiPaths.opMonthRoot(new Date())}/op_OLD.pending.json`
    await adapter.writeJSON(oldPendingPath, {
      id: 'OLD',
      type: 'apply_proposal',
      state: 'pending',
      created_at: '2025-01-01T00:00:00.000Z',
      page_writes: [],
    })

    const service = new LintService({ adapter, now: () => new Date('2026-04-29T00:00:00.000Z') })
    const result = await service.runAll({ rules: ['malformed_op_files', 'pending_op_recovery_debt'] })
    expect(result.findings.find((f) => f.rule === 'malformed_op_files')).toBeTruthy()
    const debt = result.findings.find((f) => f.rule === 'pending_op_recovery_debt')
    expect(debt).toBeTruthy()
    expect(debt.details.operation_id).toBe('OLD')
  })

  it('runAndPersist writes a markdown report at lintReports root', async () => {
    const adapter = new MemoryAdapter()
    await seedPage(adapter, { id: 'p_clean', type: 'paper', title: 'Clean' })
    const service = new LintService({ adapter, now: () => new Date('2026-04-29T00:00:00.000Z') })
    const result = await service.runAndPersist()
    expect(result.path).toBe(WikiPaths.lintReport('2026-04-29'))
    const { text } = await adapter.readTextWithMetadata(result.path)
    expect(text.startsWith('# Wiki Lint Report')).toBe(true)
  })

  it('runs all rules in LINT_RULES without throwing on a fresh wiki', async () => {
    const adapter = new MemoryAdapter()
    const service = new LintService({ adapter })
    const result = await service.runAll({ rules: LINT_RULES })
    expect(result.findings).toEqual([])
  })
})

describe('LintScheduler', () => {
  it('runs after every Nth ingestion when configured', async () => {
    const adapter = new MemoryAdapter()
    const lintService = new LintService({ adapter })
    const scheduler = new LintScheduler({
      adapter,
      lintService,
      options: { ingestion_interval: 5 },
      now: () => new Date('2026-04-29T00:00:00.000Z'),
    })
    expect(await scheduler.runIfDueAfterIngestion(4)).toBeNull()
    const triggered = await scheduler.runIfDueAfterIngestion(5)
    expect(triggered).toBeTruthy()
    expect(triggered.run.trigger).toBe('ingestion')
    const state = await scheduler.loadState()
    expect(state.ingestion_count_at_last_run).toBe(5)
  })

  it('runs weekly only on the configured day', async () => {
    const adapter = new MemoryAdapter()
    const lintService = new LintService({ adapter })
    // 2026-04-26 is a Sunday (UTC day = 0).
    const sunday = new Date('2026-04-26T01:00:00.000Z')
    const monday = new Date('2026-04-27T01:00:00.000Z')
    let now = monday
    const scheduler = new LintScheduler({
      adapter,
      lintService,
      options: { weekly_day: 0, weekly_min_days_between: 6 },
      now: () => now,
    })
    expect(await scheduler.runWeeklyIfDue()).toBeNull()
    now = sunday
    const result = await scheduler.runWeeklyIfDue()
    expect(result).toBeTruthy()
    expect(result.run.trigger).toBe('weekly')
    const second = await scheduler.runWeeklyIfDue()
    expect(second).toBeNull()
  })

  it('manual runs always execute and persist state', async () => {
    const adapter = new MemoryAdapter()
    const lintService = new LintService({ adapter })
    const scheduler = new LintScheduler({ adapter, lintService })
    const result = await scheduler.runManual()
    expect(result.run.trigger).toBe('manual')
    const state = await scheduler.loadState()
    expect(state.runs).toHaveLength(1)
  })
})
