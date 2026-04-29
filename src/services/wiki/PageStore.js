import { ulid } from 'ulid'
import { StorageError, STORAGE_ERRORS } from '../storage/StorageAdapter'
import { WikiPaths } from './WikiPaths'
import { parseWikiMarkdown, stringifyWikiMarkdown } from './WikiMarkdown'
import { hashMarkdown } from './WikiHash'
import { readJSONOrNull } from './WikiStorage'

const PAGE_ROOTS = ['paper', 'concept', 'method', 'dataset', 'person', 'position/_drafts', 'position', 'analysis', 'question', '_private/grant']
const CACHE_TTL_MS = 30_000
const READ_CONCURRENCY = 6
const adapterCaches = new WeakMap()

function slugify(value) {
  return String(value || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled'
}

export { slugify }

function normalizeAliases(aliases) {
  return [...new Set((aliases || []).map((alias) => String(alias).trim()).filter(Boolean))]
}

function cacheFor(adapter) {
  if (!adapter || (typeof adapter !== 'object' && typeof adapter !== 'function')) return null
  let cache = adapterCaches.get(adapter)
  if (!cache) {
    cache = {
      summaries: null,
      summariesAt: 0,
      pagesByType: new Map(),
      pagesByPath: new Map(),
    }
    adapterCaches.set(adapter, cache)
  }
  return cache
}

function isFresh(timestamp) {
  return timestamp && Date.now() - timestamp < CACHE_TTL_MS
}

function inferTypeFromPath(path) {
  const value = String(path || '')
  if (value.includes('/_private/grant/')) return 'grant'
  if (value.includes('/position/_drafts/')) return 'position_draft'
  const match = value.match(/^_wiki\/([^/]+)\//)
  return match?.[1] || 'paper'
}

function pageFromSidecarRow(row) {
  const type = row.type || inferTypeFromPath(row.path)
  const title = row.title || row.id
  return {
    id: row.id,
    path: row.path,
    frontmatter: {
      id: row.id,
      type,
      handle: row.handle,
      title,
      aliases: row.aliases || [],
      tags: row.tags || [],
      archived: row.archived === true,
      outcome: row.outcome,
      outcome_other: row.outcome_other,
      funder: row.funder,
      program: row.program,
      submitted: row.submitted,
      related_source_docs: row.related_source_docs || [],
      last_human_review: row.last_human_review || null,
      last_updated: row.last_updated || row.updated_at || null,
      updated_at: row.updated_at || null,
    },
    body: '',
    storage: { revision: row.revision || null, modified: row.updated_at || null },
    hash: row.hash || null,
    summaryOnly: true,
  }
}

function sidecarRowFromPage(page) {
  const frontmatter = page.frontmatter || {}
  return {
    id: page.id,
    type: frontmatter.type || inferTypeFromPath(page.path),
    handle: frontmatter.handle || null,
    title: frontmatter.title || page.id,
    aliases: frontmatter.aliases || [],
    tags: frontmatter.tags || [],
    path: page.path,
    revision: page.storage?.revision || null,
    hash: page.hash || null,
    updated_at: frontmatter.updated_at || frontmatter.last_updated || page.storage?.modified || null,
    last_updated: frontmatter.last_updated || null,
    last_human_review: frontmatter.last_human_review || null,
    archived: frontmatter.archived === true,
    outcome: frontmatter.outcome,
    outcome_other: frontmatter.outcome_other,
    funder: frontmatter.funder,
    program: frontmatter.program,
    submitted: frontmatter.submitted,
    related_source_docs: frontmatter.related_source_docs || [],
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let index = 0
  async function run() {
    while (index < items.length) {
      const current = index++
      results[current] = await worker(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

export class PageStore {
  static clearCache(adapter) {
    const cache = cacheFor(adapter)
    if (!cache) return
    cache.summaries = null
    cache.summariesAt = 0
    cache.pagesByType.clear()
    cache.pagesByPath.clear()
  }

  static createPageId(title) {
    return `${slugify(title)}-${ulid()}`
  }

  static async readPage(adapter, pageId) {
    const path = await this.findPagePath(adapter, pageId)
    return this.readPageByPath(adapter, path)
  }

  static async readPageByPath(adapter, path, { force = false } = {}) {
    const cache = cacheFor(adapter)
    const cached = cache?.pagesByPath.get(path)
    if (!force && cached && isFresh(cached.timestamp)) return cached.page
    const { text, metadata } = await adapter.readTextWithMetadata(path)
    const parsed = parseWikiMarkdown(text)
    const page = {
      id: parsed.frontmatter.id || path.split('/').pop().replace(/\.md$/, ''),
      path,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      storage: metadata,
      hash: await hashMarkdown(text),
      rawText: text,
    }
    cache?.pagesByPath.set(path, { page, timestamp: Date.now() })
    return page
  }

  static async writePage(adapter, page, expectedRevision = null) {
    const now = new Date().toISOString()
    const id = page.id || PageStore.createPageId(page.title)
    const frontmatter = {
      id,
      handle: page.handle || page.frontmatter?.handle || slugify(page.title || page.frontmatter?.title || id),
      type: page.type || page.frontmatter?.type || 'paper',
      title: page.title || page.frontmatter?.title || 'Untitled',
      aliases: normalizeAliases(page.aliases || page.frontmatter?.aliases),
      tags: normalizeAliases(page.tags || page.frontmatter?.tags),
      created_at: page.created_at || page.frontmatter?.created_at || now,
      updated_at: now,
      ...page.frontmatter,
      id,
    }
    const text = stringifyWikiMarkdown(frontmatter, page.body || '')
    const path = WikiPaths.page(id, frontmatter.type, frontmatter.handle)
    const metadata = await adapter.writeTextIfRevision(path, text, expectedRevision)
    const written = {
      id,
      path,
      frontmatter,
      body: page.body || '',
      storage: metadata,
      hash: await hashMarkdown(text),
      rawText: text,
    }
    this.clearCache(adapter)
    return written
  }

  static async listPages(adapter, { force = false } = {}) {
    const cache = cacheFor(adapter)
    const cached = cache?.pagesByType.get('__all__')
    if (!force && cached && isFresh(cached.timestamp)) return cached.pages
    const entries = []
    await Promise.all(PAGE_ROOTS.map(async (root) => {
      const folder = `${WikiPaths.root}/${root}`
      try {
        const rows = await adapter.listFolder(folder)
        entries.push(...rows.map((row) => ({ ...row, folder })))
      } catch (error) {
        if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
      }
    }))
    const pages = []
    const pageEntries = entries.filter((item) => item.type === 'file' && item.name.endsWith('.md'))
    const loaded = await mapLimit(pageEntries, READ_CONCURRENCY, async (entry) => {
      try {
        const path = `${entry.folder}/${entry.name}`
        return await this.readPageByPath(adapter, path, { force })
      } catch (error) {
        if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
        return null
      }
    })
    pages.push(...loaded.filter(Boolean))
    cache?.pagesByType.set('__all__', { pages, timestamp: Date.now() })
    return pages
  }

  static async listPagesByType(adapter, type, { force = false } = {}) {
    const key = String(type || 'paper')
    const cache = cacheFor(adapter)
    const cached = cache?.pagesByType.get(key)
    if (!force && cached && isFresh(cached.timestamp)) return cached.pages

    const folder = WikiPaths.typeRoot(key)
    let rows = []
    try {
      rows = await adapter.listFolder(folder)
    } catch (error) {
      if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
    }
    const entries = rows
      .filter((item) => item.type === 'file' && item.name.endsWith('.md'))
      .map((item) => ({ ...item, folder }))
    const pages = (await mapLimit(entries, READ_CONCURRENCY, async (entry) => {
      try {
        return await this.readPageByPath(adapter, `${entry.folder}/${entry.name}`, { force })
      } catch (error) {
        if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
        return null
      }
    })).filter(Boolean)
    cache?.pagesByType.set(key, { pages, timestamp: Date.now() })
    return pages
  }

  static async listPageSummaries(adapter, { type = null, force = false } = {}) {
    const cache = cacheFor(adapter)
    if (!force && cache?.summaries && isFresh(cache.summariesAt)) {
      return type ? cache.summaries.filter((page) => page.frontmatter?.type === type) : cache.summaries
    }

    const sidecar = await readJSONOrNull(adapter, WikiPaths.pagesSidecar)
    if (sidecar?.pages?.length) {
      const summaries = sidecar.pages
        .filter((row) => row.id && row.path)
        .map(pageFromSidecarRow)
      if (cache) {
        cache.summaries = summaries
        cache.summariesAt = Date.now()
      }
      return type ? summaries.filter((page) => page.frontmatter?.type === type) : summaries
    }

    const pages = type ? await this.listPagesByType(adapter, type, { force }) : await this.listPages(adapter, { force })
    const summaries = pages.map((page) => pageFromSidecarRow(sidecarRowFromPage(page)))
    if (!type && cache) {
      cache.summaries = summaries
      cache.summariesAt = Date.now()
    }
    return summaries
  }

  static async pageExists(adapter, pageId) {
    try {
      await adapter.getMetadata(await this.findPagePath(adapter, pageId))
      return true
    } catch (error) {
      if (error.code === STORAGE_ERRORS.NOT_FOUND) return false
      throw error
    }
  }

  static revisionConflict(message) {
    return new StorageError(STORAGE_ERRORS.REVISION_CONFLICT, message)
  }

  static async findPagePath(adapter, pageId) {
    const summaries = await this.listPageSummaries(adapter)
    const summary = summaries.find((candidate) => candidate.id === pageId)
    if (summary?.path) return summary.path
    const pages = await this.listPages(adapter)
    const page = pages.find((candidate) => candidate.id === pageId)
    if (page) return page.path
    throw new StorageError(STORAGE_ERRORS.NOT_FOUND, `Wiki page not found: ${pageId}`)
  }
}
