import { ulid } from 'ulid'
import { WikiPaths } from './WikiPaths'
import { writeJSONWithRevision } from './WikiStorage'
import { PageStore } from './PageStore'
import { SidecarService } from './SidecarService'
import { WikiStateService } from './WikiStateService'

function opTimestamp() {
  return new Date().toISOString()
}

function dateFromOperation(operation) {
  return operation?.created_at ? new Date(operation.created_at) : new Date()
}

export class OperationLogService {
  static createPendingOperation({ type, pageWrites = [], metadata = {} }) {
    const id = ulid()
    return {
      id,
      type,
      state: 'pending',
      created_at: opTimestamp(),
      page_writes: pageWrites,
      metadata,
    }
  }

  static async writePending(adapter, operation) {
    await writeJSONWithRevision(adapter, WikiPaths.pendingOp(operation.id, dateFromOperation(operation)), operation)
    return operation
  }

  static async commit(adapter, operation, result = {}) {
    const committed = {
      ...operation,
      ...result,
      state: 'committed',
      committed_at: opTimestamp(),
    }
    await writeJSONWithRevision(adapter, WikiPaths.committedOp(operation.id, dateFromOperation(operation)), committed)
    await this._deleteIfExists(adapter, WikiPaths.pendingOp(operation.id, dateFromOperation(operation)))
    return committed
  }

  static async recover(adapter) {
    const pending = await this.listPending(adapter)
    const recovered = []

    for (const operation of pending) {
      const intended = operation.page_writes || []
      const written = []

      for (const write of intended) {
        if (await PageStore.pageExists(adapter, write.page_id)) {
          written.push(write.page_id)
        }
      }

      if (written.length === 0) {
        await this.archivePending(adapter, operation, 'abandoned_no_writes')
        recovered.push({ operation_id: operation.id, action: 'archived_abandoned' })
      } else if (written.length === intended.length) {
        const sidecars = await SidecarService.regenerate(adapter)
        await this.commit(adapter, operation, {
          recovery: { recovered_at: opTimestamp(), action: 'committed_all_writes_present' },
          sidecar_counts: { pages: sidecars.pages.count, alias_conflicts: sidecars.conflicts.length },
        })
        recovered.push({ operation_id: operation.id, action: 'committed' })
      } else {
        await WikiStateService.enterSafetyMode(
          adapter,
          `Partial wiki operation ${operation.id}: ${written.length}/${intended.length} page writes present`
        )
        recovered.push({ operation_id: operation.id, action: 'safety_mode' })
      }
    }

    await WikiStateService.save(adapter, {
      last_recovery_at: opTimestamp(),
      last_recovery: recovered,
    })
    return recovered
  }

  static async listPending(adapter) {
    return this._listOps(adapter, '.pending.json')
  }

  static async listCommitted(adapter, limit = 10) {
    const ops = await this._listOps(adapter, '.committed.json')
    return ops
      .sort((a, b) => String(b.committed_at || '').localeCompare(String(a.committed_at || '')))
      .slice(0, limit)
  }

  static async archivePending(adapter, operation, reason) {
    const archived = {
      ...operation,
      state: 'archived',
      archived_at: opTimestamp(),
      archive_reason: reason,
    }
    await writeJSONWithRevision(adapter, WikiPaths.committedOp(operation.id, dateFromOperation(operation)).replace('.committed.json', '.archived.json'), archived)
    await this._deleteIfExists(adapter, WikiPaths.pendingOp(operation.id, dateFromOperation(operation)))
    return archived
  }

  static async _listOps(adapter, suffix) {
    const files = await this._listFilesRecursive(adapter, WikiPaths.opsRoot)
    const ops = []
    for (const entry of files.filter((item) => item.path.endsWith(suffix))) {
      try {
        ops.push(await adapter.readJSON(entry.path))
      } catch {
        // Corrupt operation files are reported by integrity checks.
      }
    }
    return ops
  }

  static async _listFilesRecursive(adapter, root) {
    let entries
    try {
      entries = await adapter.listFolder(root)
    } catch {
      return []
    }
    const files = []
    for (const entry of entries) {
      const path = `${root}/${entry.name}`
      if (entry.type === 'folder') {
        files.push(...await this._listFilesRecursive(adapter, path))
      } else {
        files.push({ ...entry, path })
      }
    }
    return files
  }

  static async _deleteIfExists(adapter, path) {
    try {
      await adapter.deleteFile(path)
    } catch {
      // The operation may already have been moved by another client.
    }
  }
}
