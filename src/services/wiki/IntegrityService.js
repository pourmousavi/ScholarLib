import { WikiPaths } from './WikiPaths'
import { PageStore } from './PageStore'
import { readJSONOrNull } from './WikiStorage'
import { WikiStateService } from './WikiStateService'

export class IntegrityService {
  static async check(adapter) {
    const pages = await PageStore.listPages(adapter)
    const pagesSidecar = await readJSONOrNull(adapter, WikiPaths.pagesSidecar)
    const aliasesSidecar = await readJSONOrNull(adapter, WikiPaths.aliasesSidecar)
    const issues = []

    const sidecarById = new Map((pagesSidecar?.pages || []).map((page) => [page.id, page]))
    const actualIds = new Set()

    for (const page of pages) {
      actualIds.add(page.id)
      const row = sidecarById.get(page.id)
      if (!row) {
        issues.push({ severity: 'warning', code: 'PAGE_MISSING_FROM_SIDECAR', page_id: page.id })
        continue
      }
      if (row.hash !== page.hash) {
        issues.push({ severity: 'error', code: 'PAGE_HASH_MISMATCH', page_id: page.id })
      }
      if (row.revision !== page.storage.revision) {
        issues.push({ severity: 'warning', code: 'PAGE_REVISION_MISMATCH', page_id: page.id })
      }
    }

    for (const row of pagesSidecar?.pages || []) {
      if (!actualIds.has(row.id)) {
        issues.push({ severity: 'warning', code: 'SIDECAR_PAGE_NOT_FOUND', page_id: row.id })
      }
    }

    for (const [alias, entry] of Object.entries(aliasesSidecar?.aliases || {})) {
      const pageId = typeof entry === 'string' ? entry : entry.page_id
      if (!actualIds.has(pageId)) {
        issues.push({ severity: 'warning', code: 'ALIAS_TARGET_NOT_FOUND', alias, page_id: pageId })
      }
    }

    const result = {
      checked_at: new Date().toISOString(),
      ok: issues.filter((issue) => issue.severity === 'error').length === 0,
      page_count: pages.length,
      issues,
    }

    await WikiStateService.save(adapter, { last_integrity_check: result })
    return result
  }
}
