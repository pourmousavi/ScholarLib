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

function normalizeAliases(aliases) {
  return [...new Set((aliases || []).map((alias) => String(alias).trim()).filter(Boolean))]
}

export class PageStore {
  static createPageId(title) {
    return `${slugify(title)}-${ulid()}`
  }

  static async readPage(adapter, pageId) {
    const path = WikiPaths.page(pageId)
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
      title: page.title || page.frontmatter?.title || 'Untitled',
      aliases: normalizeAliases(page.aliases || page.frontmatter?.aliases),
      tags: normalizeAliases(page.tags || page.frontmatter?.tags),
      created_at: page.created_at || page.frontmatter?.created_at || now,
      updated_at: now,
      ...page.frontmatter,
      id,
    }
    const text = stringifyWikiMarkdown(frontmatter, page.body || '')
    const metadata = await adapter.writeTextIfRevision(WikiPaths.page(id), text, expectedRevision)
    return {
      id,
      path: WikiPaths.page(id),
      frontmatter,
      body: page.body || '',
      storage: metadata,
      hash: await hashMarkdown(text),
    }
  }

  static async listPages(adapter) {
    let entries
    try {
      entries = await adapter.listFolder(WikiPaths.pagesRoot)
    } catch (error) {
      if (error.code === STORAGE_ERRORS.NOT_FOUND) return []
      throw error
    }

    const pages = []
    for (const entry of entries.filter((item) => item.type === 'file' && item.name.endsWith('.md'))) {
      const pageId = entry.name.replace(/\.md$/, '')
      try {
        pages.push(await this.readPage(adapter, pageId))
      } catch (error) {
        if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
      }
    }
    return pages
  }

  static async pageExists(adapter, pageId) {
    try {
      await adapter.getMetadata(WikiPaths.page(pageId))
      return true
    } catch (error) {
      if (error.code === STORAGE_ERRORS.NOT_FOUND) return false
      throw error
    }
  }

  static revisionConflict(message) {
    return new StorageError(STORAGE_ERRORS.REVISION_CONFLICT, message)
  }
}
