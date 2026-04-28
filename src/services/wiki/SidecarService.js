import { WikiPaths } from './WikiPaths'
import { PageStore } from './PageStore'
import { hashJson } from './WikiHash'
import { writeJSONWithRevision } from './WikiStorage'
import { WikiStateService } from './WikiStateService'

function aliasKey(alias) {
  return String(alias || '').trim().toLowerCase()
}

export class SidecarService {
  static async regenerate(adapter) {
    const pages = await PageStore.listPages(adapter)
    const pageRows = []
    const aliases = {}
    const conflicts = []

    for (const page of pages) {
      const row = {
        id: page.id,
        title: page.frontmatter.title || page.id,
        aliases: page.frontmatter.aliases || [],
        tags: page.frontmatter.tags || [],
        path: page.path,
        revision: page.storage.revision,
        hash: page.hash,
        updated_at: page.frontmatter.updated_at || page.storage.modified || null,
      }
      pageRows.push(row)

      for (const alias of [row.title, ...row.aliases]) {
        const key = aliasKey(alias)
        if (!key) continue
        if (aliases[key] && aliases[key] !== page.id) {
          conflicts.push({ alias, page_ids: [aliases[key], page.id] })
        } else {
          aliases[key] = page.id
        }
      }
    }

    pageRows.sort((a, b) => a.title.localeCompare(b.title))

    const pagesSidecar = {
      version: '0A',
      generated_at: new Date().toISOString(),
      count: pageRows.length,
      pages: pageRows,
      hash: await hashJson(pageRows),
    }

    const aliasesSidecar = {
      version: '0A',
      generated_at: pagesSidecar.generated_at,
      aliases,
      conflicts,
      hash: await hashJson({ aliases, conflicts }),
    }

    await writeJSONWithRevision(adapter, WikiPaths.pagesSidecar, pagesSidecar)
    await writeJSONWithRevision(adapter, WikiPaths.aliasesSidecar, aliasesSidecar)
    await WikiStateService.save(adapter, { page_count: pageRows.length })

    return {
      pages: pagesSidecar,
      aliases: aliasesSidecar,
      conflicts,
    }
  }
}
