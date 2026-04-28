import { describe, it, expect } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { STORAGE_ERRORS } from '../../storage/StorageAdapter'
import { CapabilityService, WikiService } from '../WikiService'
import { PageStore } from '../PageStore'
import { SidecarService } from '../SidecarService'
import { IntegrityService } from '../IntegrityService'
import { OperationLogService } from '../OperationLogService'
import { WikiPaths } from '../WikiPaths'
import { parseYamlFence, parseWikiMarkdown, stringifyWikiMarkdown } from '../WikiMarkdown'

describe('ScholarLib wiki Phase 0A', () => {
  it('uses MemoryAdapter for existing and revision-aware storage methods', async () => {
    const adapter = new MemoryAdapter()

    await adapter.writeJSON('_system/example.json', { ok: true })
    expect(await adapter.readJSON('_system/example.json')).toEqual({ ok: true })

    await adapter.uploadFile('PDFs/test.txt', new Blob(['hello']))
    expect(await (await adapter.downloadFile('PDFs/test.txt')).text()).toBe('hello')

    await adapter.createFolder('Wiki/pages')
    expect((await adapter.listFolder('Wiki')).map((item) => item.name)).toContain('pages')

    const created = await adapter.writeTextIfRevision('Wiki/pages/a.md', 'one', null)
    const read = await adapter.readTextWithMetadata('Wiki/pages/a.md')
    expect(read.text).toBe('one')
    expect(read.metadata.revision).toBe(created.revision)

    await expect(adapter.writeTextIfRevision('Wiki/pages/a.md', 'two', null))
      .rejects.toMatchObject({ code: STORAGE_ERRORS.REVISION_CONFLICT })

    const updated = await adapter.writeTextIfRevision('Wiki/pages/a.md', 'two', created.revision)
    expect(updated.revision).not.toBe(created.revision)

    await adapter.deleteFile('Wiki/pages/a.md')
    await expect(adapter.getMetadata('Wiki/pages/a.md'))
      .rejects.toMatchObject({ code: STORAGE_ERRORS.NOT_FOUND })
  })

  it('parses frontmatter and fenced YAML through yaml package helpers', () => {
    const markdown = stringifyWikiMarkdown({ id: 'p1', aliases: ['A'] }, 'Body\n\n```wiki-links\n- target: p2\n```')
    const parsed = parseWikiMarkdown(markdown)
    expect(parsed.frontmatter).toEqual({ id: 'p1', aliases: ['A'] })
    expect(parseYamlFence(markdown, 'wiki-links')).toEqual([{ target: 'p2' }])
  })

  it('initializes status, pages, sidecars, and integrity against MemoryAdapter', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)

    const page = await PageStore.writePage(adapter, {
      id: 'battery-notes',
      title: 'Battery Notes',
      aliases: ['Cells'],
      tags: ['energy'],
      body: '# Battery Notes\n',
    }, null)

    const sidecars = await SidecarService.regenerate(adapter)
    expect(sidecars.pages.count).toBe(1)
    expect(sidecars.aliases.aliases.cells).toBe(page.id)

    const integrity = await IntegrityService.check(adapter)
    expect(integrity.ok).toBe(true)
    expect(integrity.page_count).toBe(1)

    const status = await WikiService.getStatus(adapter)
    expect(status.counts.pages).toBe(1)
    expect(status.counts.aliases).toBe(2)
  })

  it('checks capabilities without cloud credentials', async () => {
    const adapter = new MemoryAdapter()
    const result = await CapabilityService.check(adapter)
    expect(result.ok).toBe(true)
    expect(result.provider).toBe('memory')
  })

  it('recovers pending operations using explicit partial-state rules', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)

    const abandoned = OperationLogService.createPendingOperation({
      type: 'test',
      pageWrites: [{ page_id: 'not-written' }],
    })
    await OperationLogService.writePending(adapter, abandoned)

    const committed = OperationLogService.createPendingOperation({
      type: 'test',
      pageWrites: [{ page_id: 'written' }],
    })
    await OperationLogService.writePending(adapter, committed)
    await PageStore.writePage(adapter, { id: 'written', title: 'Written', body: 'done' }, null)

    const partial = OperationLogService.createPendingOperation({
      type: 'test',
      pageWrites: [{ page_id: 'partial-a' }, { page_id: 'partial-b' }],
    })
    await OperationLogService.writePending(adapter, partial)
    await PageStore.writePage(adapter, { id: 'partial-a', title: 'Partial A', body: 'done' }, null)

    const recovered = await OperationLogService.recover(adapter)
    expect(recovered).toEqual(expect.arrayContaining([
      { operation_id: abandoned.id, action: 'archived_abandoned' },
      { operation_id: committed.id, action: 'committed' },
      { operation_id: partial.id, action: 'safety_mode' },
    ]))

    const state = await adapter.readJSON(WikiPaths.state)
    expect(state.safety_mode).toBe(true)
    expect(await OperationLogService.listPending(adapter)).toHaveLength(1)
  })
})
