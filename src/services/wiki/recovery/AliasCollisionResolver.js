import { PageStore } from '../PageStore'
import { normalizeAliasKey } from '../SidecarService'
import { stringifyWikiMarkdown } from '../WikiMarkdown'

/**
 * Detect and resolve alias collisions that wedge sidecar regeneration
 * (and therefore wiki ingestion) by tripping WIKI_ALIAS_COLLISION.
 *
 * The detection logic mirrors SidecarService.regenerate so the conflicts
 * we surface here are exactly the ones blocking it.
 */
export class AliasCollisionResolver {
  static async detect(adapter) {
    const pages = await PageStore.listPages(adapter, { force: true })
    const byKey = new Map()
    const conflicts = []

    for (const page of pages) {
      if (page.frontmatter?.archived === true) continue
      const title = page.frontmatter?.title || page.id
      const aliases = page.frontmatter?.aliases || []
      const seenInThisPage = new Set()
      for (const alias of [title, ...aliases]) {
        const key = normalizeAliasKey(alias)
        if (!key || seenInThisPage.has(key)) continue
        seenInThisPage.add(key)
        const existing = byKey.get(key)
        if (!existing) {
          byKey.set(key, { alias, page })
          continue
        }
        if (existing.page.id === page.id) continue
        let conflict = conflicts.find((c) => c.normalized === key)
        if (!conflict) {
          conflict = { normalized: key, alias, pages: [summarize(existing.page)] }
          conflicts.push(conflict)
        }
        if (!conflict.pages.some((p) => p.id === page.id)) {
          conflict.pages.push(summarize(page))
        }
      }
    }

    return conflicts
  }

  static async archivePage(adapter, pageId, { supersededBy = null, reason = 'collision_recovery' } = {}) {
    const page = await PageStore.readPage(adapter, pageId)
    const today = new Date().toISOString().slice(0, 10)
    const updatedFrontmatter = {
      ...page.frontmatter,
      archived: true,
      archive_reason: reason,
      last_updated: today,
    }
    if (supersededBy) updatedFrontmatter.superseded_by = supersededBy
    const text = stringifyWikiMarkdown(updatedFrontmatter, page.body || '')
    await adapter.writeTextIfRevision(page.path, text, page.storage?.revision ?? null)
    PageStore.clearCache(adapter)
    return { id: page.id, path: page.path, archived: true }
  }
}

function summarize(page) {
  return {
    id: page.id,
    title: page.frontmatter?.title || page.id,
    type: page.frontmatter?.type || 'paper',
    path: page.path,
    aliases: page.frontmatter?.aliases || [],
    scholarlib_doc_id: page.frontmatter?.scholarlib_doc_id || null,
    superseded_by: page.frontmatter?.superseded_by || null,
    updated_at: page.frontmatter?.updated_at || page.storage?.modified || null,
    last_updated: page.frontmatter?.last_updated || null,
  }
}
