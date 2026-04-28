import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { WikiService } from '../WikiService'
import { PageStore } from '../PageStore'
import { SidecarService } from '../SidecarService'
import { WikiStateService } from '../WikiStateService'
import { WikiPaths } from '../WikiPaths'
import {
  SchemaMigrationError,
  SchemaMigrationRunner,
  clearMigrationRegistry,
  registerMigration,
} from '../migrations/SchemaMigrationRunner'

async function seedWikiWithPages(adapter) {
  await WikiService.initialize(adapter)
  await PageStore.writePage(adapter, {
    id: 'c_one',
    title: 'Concept One',
    type: 'concept',
    handle: 'concept-one',
    body: 'Body one',
    frontmatter: { schema_version: '1.0' },
  })
  await PageStore.writePage(adapter, {
    id: 'c_two',
    title: 'Concept Two',
    type: 'concept',
    handle: 'concept-two',
    body: 'Body two',
    frontmatter: { schema_version: '1.0' },
  })
  await SidecarService.regenerate(adapter)
}

function noopMigration() {
  return {
    migration_id: 'noop_1_0_to_1_1',
    from_version: '1.0',
    to_version: '1.1',
    is_breaking: false,
    schema_changes_summary: 'noop migration for tests',
    async transformPage(page) {
      return {
        frontmatter: { ...page.frontmatter, schema_version: '1.1' },
        body: page.body,
      }
    },
    async validateAfter() {
      return { ok: true }
    },
  }
}

function failingMigration() {
  return {
    migration_id: 'fail_1_0_to_1_1',
    from_version: '1.0',
    to_version: '1.1',
    is_breaking: true,
    schema_changes_summary: 'deliberately failing migration',
    async transformPage(page) {
      return {
        frontmatter: { ...page.frontmatter, schema_version: '1.1', injected: 'broken' },
        body: page.body,
      }
    },
    async validateAfter() {
      return { ok: false, message: 'simulated validation failure' }
    },
  }
}

describe('SchemaMigrationRunner', () => {
  it('runs a no-op migration, persists a record, and produces a backup snapshot of every page and sidecar', async () => {
    clearMigrationRegistry()
    const migration = noopMigration()
    registerMigration(migration)
    const adapter = new MemoryAdapter()
    await seedWikiWithPages(adapter)

    const runner = new SchemaMigrationRunner({ adapter })
    const record = await runner.runMigration(migration.migration_id)

    expect(record.status).toBe('completed')
    expect(record.pages_touched.map((entry) => entry.id).sort()).toEqual(['c_one', 'c_two'])

    const pageOne = await PageStore.readPage(adapter, 'c_one')
    expect(pageOne.frontmatter.schema_version).toBe('1.1')

    const pages = await PageStore.listPages(adapter)
    const backupPages = await adapter.listFolder(`${record.backup_path}/pages`)
    expect(backupPages.filter((entry) => entry.type === 'file')).toHaveLength(pages.length)

    const backupSidecars = await adapter.listFolder(`${record.backup_path}/sidecars`)
    expect(backupSidecars.find((entry) => entry.name === 'pages.json')).toBeTruthy()

    const persisted = await adapter.readJSON(WikiPaths.migration(migration.migration_id))
    expect(persisted.status).toBe('completed')
  })

  it('rolls back when validateAfter rejects and leaves canonical pages untouched', async () => {
    clearMigrationRegistry()
    const migration = failingMigration()
    registerMigration(migration)
    const adapter = new MemoryAdapter()
    await seedWikiWithPages(adapter)

    const runner = new SchemaMigrationRunner({ adapter })
    await expect(runner.runMigration(migration.migration_id)).rejects.toBeInstanceOf(SchemaMigrationError)

    const pageOne = await PageStore.readPage(adapter, 'c_one')
    expect(pageOne.frontmatter.schema_version).toBe('1.0')
    expect(pageOne.frontmatter.injected).toBeUndefined()

    const persisted = await adapter.readJSON(WikiPaths.migration(migration.migration_id))
    expect(persisted.status).toBe('rolled_back')
    expect(persisted.error?.message).toMatch(/simulated validation failure/)
  })

  it('refuses to run when the wiki is in safety mode', async () => {
    clearMigrationRegistry()
    const migration = noopMigration()
    registerMigration(migration)
    const adapter = new MemoryAdapter()
    await seedWikiWithPages(adapter)
    await WikiStateService.enterSafetyMode(adapter, 'test reason')

    const runner = new SchemaMigrationRunner({ adapter })
    await expect(runner.runMigration(migration.migration_id)).rejects.toMatchObject({ code: 'WIKI_SAFETY_MODE' })
  })

  it('rejects unregistered migrations with a clear error code', async () => {
    clearMigrationRegistry()
    const adapter = new MemoryAdapter()
    await seedWikiWithPages(adapter)
    const runner = new SchemaMigrationRunner({ adapter })
    await expect(runner.runMigration('does_not_exist')).rejects.toMatchObject({ code: 'MIGRATION_NOT_REGISTERED' })
  })
})
