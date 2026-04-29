import { ulid } from 'ulid'
import { StorageError, STORAGE_ERRORS } from '../storage/StorageAdapter'
import { WikiPaths } from './WikiPaths'
import { parseWikiMarkdown, stringifyWikiMarkdown } from './WikiMarkdown'
import { hashMarkdown } from './WikiHash'

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

export class PageStore {
  static createPageId(title) {
    return `${slugify(title)}-${ulid()}`
  }

  static async readPage(adapter, pageId) {
    const path = await this.findPagePath(adapter, pageId)
    const { text, metadata } = await adapter.readTextWithMetadata(path)
    const parsed = parseWikiMarkdown(text)
    return {
      id: parsed.frontmatter.id || pageId,
      path,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      storage: metadata,
      hash: await hashMarkdown(text),
    }
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
    return {
      id,
      path,
      frontmatter,
      body: page.body || '',
      storage: metadata,
      hash: await hashMarkdown(text),
    }
  }

  static async listPages(adapter) {
    const roots = ['paper', 'concept', 'method', 'dataset', 'person', 'position/_drafts', 'position', 'analysis', 'question', '_private/grant']
    const entries = []
    for (const root of roots) {
      const folder = `${WikiPaths.root}/${root}`
      try {
        const rows = await adapter.listFolder(folder)
        entries.push(...rows.map((row) => ({ ...row, folder })))
      } catch (error) {
        if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
      }
    }
    const pages = []
    for (const entry of entries.filter((item) => item.type === 'file' && item.name.endsWith('.md'))) {
      try {
        const path = `${entry.folder}/${entry.name}`
        const { text, metadata } = await adapter.readTextWithMetadata(path)
        const parsed = parseWikiMarkdown(text)
        pages.push({
          id: parsed.frontmatter.id || entry.name.replace(/\.md$/, ''),
          path,
          frontmatter: parsed.frontmatter,
          body: parsed.body,
          storage: metadata,
          hash: await hashMarkdown(text),
        })
      } catch (error) {
        if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
      }
    }
    return pages
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
    const pages = await this.listPages(adapter)
    const page = pages.find((candidate) => candidate.id === pageId)
    if (page) return page.path
    throw new StorageError(STORAGE_ERRORS.NOT_FOUND, `Wiki page not found: ${pageId}`)
  }
}
