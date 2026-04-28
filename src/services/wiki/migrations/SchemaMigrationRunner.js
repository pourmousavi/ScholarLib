import { ulid } from 'ulid'
import { STORAGE_ERRORS } from '../../storage/StorageAdapter'
import { OperationLogService } from '../OperationLogService'
import { PageStore } from '../PageStore'
import { SidecarService } from '../SidecarService'
import { WikiPaths } from '../WikiPaths'
import { WikiStateService } from '../WikiStateService'
import { parseWikiMarkdown, stringifyWikiMarkdown } from '../WikiMarkdown'
import { readJSONOrNull, writeJSONWithRevision } from '../WikiStorage'

export class SchemaMigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'SchemaMigrationError'
    this.code = code
    this.details = details
  }
}

const DEFAULT_REGISTRY = new Map()

export function registerMigration(migration) {
  if (!migration?.migration_id) throw new Error('Migration must have a migration_id')
  DEFAULT_REGISTRY.set(migration.migration_id, migration)
}

export function getRegisteredMigration(id) {
  return DEFAULT_REGISTRY.get(id) || null
}

export function clearMigrationRegistry() {
  DEFAULT_REGISTRY.clear()
}

function timestamp() {
  return new Date().toISOString()
}

function safeBackupLabel(iso) {
  return String(iso).replace(/[:.]/g, '-')
}

export class SchemaMigrationRunner {
  constructor({ adapter, registry } = {}) {
    if (!adapter) throw new Error('SchemaMigrationRunner requires a storage adapter')
    this.adapter = adapter
    this.registry = registry || DEFAULT_REGISTRY
  }

  async runMigration(migrationId) {
    const migration = this.registry.get(migrationId)
    if (!migration) throw new SchemaMigrationError('MIGRATION_NOT_REGISTERED', `No migration registered with id ${migrationId}`)

    const state = await WikiStateService.load(this.adapter)
    if (state.safety_mode) {
      throw new SchemaMigrationError('WIKI_SAFETY_MODE', 'Cannot run schema migration while wiki is in safety mode')
    }

    const startedAt = timestamp()
    const backupLabel = safeBackupLabel(startedAt)
    const backupRoot = WikiPaths.backupRoot(backupLabel)
    const pages = await PageStore.listPages(this.adapter)
    const sidecarSnapshots = await this._snapshotSidecars(backupRoot)
    const pageSnapshots = await this._snapshotPages(pages, backupRoot)

    const operation = OperationLogService.createPendingOperation({
      type: 'schema_migration',
      pageWrites: pages.map((page) => ({ page_id: page.id, path: page.path })),
      metadata: { migration_id: migrationId, backup_path: backupRoot },
    })
    operation.id = ulid()
    await OperationLogService.writePending(this.adapter, operation)

    const record = {
      migration_id: migration.migration_id,
      from_version: migration.from_version,
      to_version: migration.to_version,
      started_at: startedAt,
      completed_at: null,
      pages_touched: [],
      backup_path: backupRoot,
      status: 'running',
      schema_changes_summary: migration.schema_changes_summary || '',
      sidecar_snapshots: sidecarSnapshots.map((entry) => entry.path),
      page_snapshots: pageSnapshots.map((entry) => entry.backupPath),
    }

    try {
      const transformedPages = []
      for (const page of pages) {
        const transformed = await migration.transformPage({ ...page })
        if (!transformed) continue
        const frontmatter = transformed.frontmatter || page.frontmatter
        const body = transformed.body ?? page.body
        const text = stringifyWikiMarkdown(frontmatter, body)
        await this.adapter.writeTextIfRevision(page.path, text, page.storage.revision)
        transformedPages.push({ id: page.id, path: page.path })
      }

      const validation = await migration.validateAfter({
        adapter: this.adapter,
        pages: await PageStore.listPages(this.adapter),
      })
      if (validation && validation.ok === false) {
        throw new SchemaMigrationError('VALIDATION_FAILED', validation.message || 'Migration validateAfter returned false', validation)
      }

      let sidecarStatus = { ok: true }
      try {
        const regenerated = await SidecarService.regenerate(this.adapter)
        sidecarStatus = { ok: true, pages: regenerated.pages.count }
      } catch (error) {
        throw new SchemaMigrationError('SIDECAR_REGEN_FAILED', error.message, { code: error.code })
      }

      record.pages_touched = transformedPages
      record.completed_at = timestamp()
      record.status = 'completed'
      record.sidecar_status = sidecarStatus
      await this._persistRecord(record)
      await WikiStateService.save(this.adapter, { schema_version: migration.to_version })
      await OperationLogService.commit(this.adapter, operation, {
        migration_record: record,
        sidecar_status: sidecarStatus,
      })
      return record
    } catch (error) {
      const rollback = await this._restoreFromBackup(pageSnapshots, sidecarSnapshots).catch((restoreError) => ({
        ok: false,
        message: restoreError.message,
      }))
      record.completed_at = timestamp()
      record.status = 'rolled_back'
      record.error = { code: error.code || 'UNKNOWN', message: error.message }
      record.rollback = rollback || { ok: true }
      await this._persistRecord(record)
      await OperationLogService.commit(this.adapter, operation, {
        migration_record: record,
        sidecar_status: { ok: false, message: error.message },
      })
      throw error
    }
  }

  async _snapshotPages(pages, backupRoot) {
    const snapshots = []
    await this.adapter.createFolder(`${backupRoot}/pages`)
    for (const page of pages) {
      const safeName = `${page.id}.md`
      const backupPath = `${backupRoot}/pages/${safeName}`
      const text = stringifyWikiMarkdown(page.frontmatter, page.body)
      await this.adapter.writeTextIfRevision(backupPath, text, null)
      snapshots.push({ pageId: page.id, originalPath: page.path, backupPath, expectedRevision: page.storage.revision })
    }
    return snapshots
  }

  async _snapshotSidecars(backupRoot) {
    const sidecarPaths = [
      WikiPaths.pagesSidecar,
      WikiPaths.aliasesSidecar,
      WikiPaths.linksSidecar,
      WikiPaths.claimsSidecar,
      WikiPaths.sourcesSidecar,
      WikiPaths.authorsSidecar,
    ]
    const snapshots = []
    await this.adapter.createFolder(`${backupRoot}/sidecars`)
    for (const path of sidecarPaths) {
      const data = await readJSONOrNull(this.adapter, path)
      if (!data) continue
      const name = path.split('/').pop()
      const target = `${backupRoot}/sidecars/${name}`
      await writeJSONWithRevision(this.adapter, target, data)
      snapshots.push({ originalPath: path, path: target })
    }
    return snapshots
  }

  async _restoreFromBackup(pageSnapshots, sidecarSnapshots) {
    for (const snapshot of pageSnapshots) {
      try {
        const { text } = await this.adapter.readTextWithMetadata(snapshot.backupPath)
        const live = await this._currentMetadataOrNull(snapshot.originalPath)
        await this.adapter.writeTextIfRevision(snapshot.originalPath, text, live?.revision ?? null)
      } catch (error) {
        if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
      }
    }
    for (const snapshot of sidecarSnapshots) {
      try {
        const data = await this.adapter.readJSON(snapshot.path)
        const live = await this._currentMetadataOrNull(snapshot.originalPath)
        await this.adapter.writeTextIfRevision(snapshot.originalPath, JSON.stringify(data, null, 2), live?.revision ?? null)
      } catch (error) {
        if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
      }
    }
    return { ok: true }
  }

  async _currentMetadataOrNull(path) {
    try {
      return await this.adapter.getMetadata(path)
    } catch (error) {
      if (error.code === STORAGE_ERRORS.NOT_FOUND) return null
      throw error
    }
  }

  async _persistRecord(record) {
    await this.adapter.createFolder(WikiPaths.migrationsRoot)
    await writeJSONWithRevision(this.adapter, WikiPaths.migration(record.migration_id), record)
    return record
  }

  static async listMigrations(adapter) {
    let entries
    try {
      entries = await adapter.listFolder(WikiPaths.migrationsRoot)
    } catch {
      return []
    }
    const records = []
    for (const entry of entries.filter((row) => row.type === 'file' && row.name.endsWith('.json'))) {
      const record = await readJSONOrNull(adapter, `${WikiPaths.migrationsRoot}/${entry.name}`)
      if (record) records.push(record)
    }
    return records.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))
  }
}

export { parseWikiMarkdown, stringifyWikiMarkdown }
