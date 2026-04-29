const INTERNAL_FRONTMATTER_KEYS = new Set([
  'content_hash',
  'frontmatter_hash',
  'body_hash',
  'page_hash',
  'storage_revision',
  'last_indexed_at',
])

function cleanHandle(value) {
  return String(value || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled'
}

function yamlScalar(value) {
  if (Array.isArray(value)) return `[${value.map(item => JSON.stringify(item)).join(', ')}]`
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(String(value))
}

export class ObsidianFormatter {
  constructor({ pages = [] } = {}) {
    this.pagesById = new Map(pages.map(page => [page.id, page]))
  }

  formatPage(page) {
    const frontmatter = this.formatFrontmatter(page.frontmatter || {})
    const body = this.formatBody(page.body || '')
    return `${frontmatter}${body.trimEnd()}\n`
  }

  formatFrontmatter(frontmatter) {
    const rows = Object.entries(frontmatter)
      .filter(([key]) => !INTERNAL_FRONTMATTER_KEYS.has(key))
      .map(([key, value]) => `${key}: ${yamlScalar(value)}`)
    return rows.length > 0 ? `---\n${rows.join('\n')}\n---\n\n` : ''
  }

  formatBody(body) {
    return this.convertFences(this.rewriteWikilinks(body))
  }

  rewriteWikilinks(body) {
    return String(body || '').replace(/\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, id, anchor = '', display = '') => {
      const page = this.pagesById.get(id)
      if (!page) return `[[${id}${anchor}${display ? `|${display}` : ''}]]`
      const handle = cleanHandle(page.frontmatter?.handle || page.frontmatter?.title || page.id)
      const title = display || page.frontmatter?.title || page.id
      return `[[${handle}${anchor}|${title}]]`
    })
  }

  convertFences(body) {
    return String(body || '').replace(/```(scholarlib-[^\n]+)\n([\s\S]*?)```/g, (_match, kind, content) => {
      const callout = kind.includes('claim') ? 'quote' : kind.includes('question') ? 'question' : 'note'
      const title = kind.replace(/^scholarlib-/, '').replace(/-/g, ' ')
      const lines = String(content || '').trimEnd().split('\n').map(line => `> ${line}`)
      return `> [!${callout}] ${title}\n${lines.join('\n')}`
    })
  }

  exportPathForPage(page) {
    const type = page.frontmatter?.type || 'paper'
    const handle = cleanHandle(page.frontmatter?.handle || page.frontmatter?.title || page.id)
    return `${type}/${handle}.md`
  }
}

export { cleanHandle }
