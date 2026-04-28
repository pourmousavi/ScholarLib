import { PageStore } from '../PageStore'
import { WikiPaths } from '../WikiPaths'
import { normalizeAliasKey } from '../SidecarService'
import { useLibraryStore } from '../../../store/libraryStore'
import { collectionService } from '../../tags/CollectionService'

const DEFAULT_BUDGET_TOKENS = 60_000
const EMBEDDING_THRESHOLD = 0.18

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4)
}

function tokenize(text) {
  return normalizeAliasKey(text).split(' ').filter(token => token.length > 2)
}

function lexicalScore(query, page) {
  const queryTokens = new Set(tokenize(query))
  if (queryTokens.size === 0) return 0
  const textTokens = tokenize([
    page.frontmatter?.title,
    ...(page.frontmatter?.aliases || []),
    page.frontmatter?.summary,
    page.body?.slice(0, 2000),
  ].filter(Boolean).join(' '))
  const hits = textTokens.filter(token => queryTokens.has(token)).length
  return hits / queryTokens.size
}

function pageTypePriority(page) {
  const type = page.frontmatter?.type
  if (type === 'concept' || type === 'method') return 3
  if (type === 'dataset' || type === 'position') return 2
  if (type === 'paper') return 1
  return 0
}

function sourceDocIds(page) {
  const frontmatter = page.frontmatter || {}
  return [
    frontmatter.scholarlib_doc_id,
    frontmatter.source_doc_id,
    ...(frontmatter.source_papers || []),
    ...(frontmatter.scholarlib_doc_ids || []),
  ].filter(Boolean)
}

function wikilinkIds(body) {
  const ids = []
  const pattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let match
  while ((match = pattern.exec(body || '')) !== null) ids.push(match[1])
  return ids
}

function getLibrary(options) {
  return options.library || {
    documents: useLibraryStore.getState().documents,
    collectionRegistry: useLibraryStore.getState().collectionRegistry,
  }
}

function docMatchesScope(doc, scope, collectionRegistry) {
  if (!doc) return false
  switch (scope?.type) {
    case 'document':
      return doc.id === scope.docId
    case 'folder':
      return doc.folder_id === scope.folderId
    case 'tags': {
      const tags = scope.tags || []
      if (tags.length === 0) return true
      const docTags = doc.user_data?.tags || []
      return scope.tagMode === 'OR' ? tags.some(tag => docTags.includes(tag)) : tags.every(tag => docTags.includes(tag))
    }
    case 'collections': {
      const slugs = scope.collections || []
      if (slugs.length === 0) return true
      const selected = slugs.map(slug => collectionRegistry?.[slug]).filter(Boolean)
      return collectionService.documentMatchesCollections(doc, selected, scope.collectionMode || 'AND')
    }
    case 'library':
    default:
      return true
  }
}

export class WikiRetrieval {
  constructor({ pageStore = PageStore, embeddingService = null } = {}) {
    this.pageStore = pageStore
    this.embeddingService = embeddingService
  }

  async retrieve(query, scope = { type: 'library' }, options = {}) {
    if (options.settings?.wiki?.enabled === false || options.wikiEnabled === false) {
      return { pages: [], confidence: 'low', retrieval_method: 'disabled', budget: { used_tokens: 0, max_tokens: options.retrievalBudget || DEFAULT_BUDGET_TOKENS } }
    }
    if (!options.adapter) {
      return { pages: [], confidence: 'low', retrieval_method: 'unavailable', budget: { used_tokens: 0, max_tokens: options.retrievalBudget || DEFAULT_BUDGET_TOKENS } }
    }

    const allPages = (await this.pageStore.listPages(options.adapter))
      .filter(page => !page.path?.startsWith(`${WikiPaths.root}/_inbox/`))
    const scopedPages = this.filterScope(allPages, scope, options)

    const aliasMatches = await this.aliasAndTitleMatches(query, scopedPages, options)
    let scored = aliasMatches
    let retrievalMethod = 'alias_match'
    let confidence = scored.some(page => page.match_type === 'alias_exact') ? 'high' : 'low'

    if (confidence === 'low') {
      scored = await this.embeddingFallback(query, scopedPages)
      retrievalMethod = 'embedding'
      confidence = scored.filter(page => page.relevance_score >= EMBEDDING_THRESHOLD).length >= 3 ? 'medium' : 'low'
    }

    const expanded = this.expandWikilinks(scored, scopedPages)
    const budgeted = this.applyBudget(expanded, options.retrievalBudget || DEFAULT_BUDGET_TOKENS)
    return {
      pages: budgeted.pages,
      confidence,
      retrieval_method: aliasMatches.length > 0 && retrievalMethod === 'embedding' ? 'hybrid' : retrievalMethod,
      budget: budgeted.budget,
    }
  }

  filterScope(pages, scope, options) {
    if (!scope || scope.type === 'library') return pages
    const library = getLibrary(options)
    const documents = library.documents || {}
    const collectionRegistry = library.collectionRegistry || library.collection_registry || {}

    if (scope.type === 'document') {
      return pages.filter(page => sourceDocIds(page).length === 0 || sourceDocIds(page).includes(scope.docId))
    }

    return pages.filter(page => {
      const ids = sourceDocIds(page)
      if (ids.length === 0) return true
      return ids.some(id => docMatchesScope(documents[id], scope, collectionRegistry))
    })
  }

  async aliasAndTitleMatches(query, pages, options = {}) {
    const queryKey = normalizeAliasKey(query)
    let aliases = {}
    try {
      aliases = options.adapter ? (await options.adapter.readJSON(WikiPaths.aliasesSidecar)).aliases || {} : {}
    } catch {
      aliases = {}
    }

    const exactPageId = Object.entries(aliases).find(([alias]) => queryKey.includes(alias) || alias.includes(queryKey))?.[1]?.page_id
    return pages
      .map(page => {
        const title = normalizeAliasKey(page.frontmatter?.title || page.id)
        const aliasList = (page.frontmatter?.aliases || []).map(normalizeAliasKey)
        const exact = page.id === exactPageId || queryKey.includes(title) || aliasList.some(alias => queryKey.includes(alias))
        const score = exact ? 1 + pageTypePriority(page) * 0.1 : lexicalScore(query, page)
        return this.resultPage(page, score, exact ? 'alias_exact' : 'title_weak')
      })
      .filter(page => page.relevance_score >= 0.2)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 8)
  }

  async embeddingFallback(query, pages) {
    return pages
      .map(page => this.resultPage(page, lexicalScore(query, page), 'embedding_proxy'))
      .filter(page => page.relevance_score > 0)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 8)
  }

  expandWikilinks(scoredPages, allPages) {
    const byId = new Map(allPages.map(page => [page.id, page]))
    const seen = new Set(scoredPages.map(page => page.page_id))
    const expanded = [...scoredPages]
    for (const page of scoredPages.slice(0, 4)) {
      for (const id of wikilinkIds(page.content)) {
        if (seen.has(id) || !byId.has(id)) continue
        seen.add(id)
        expanded.push(this.resultPage(byId.get(id), page.relevance_score * 0.6, 'wikilink_expansion'))
      }
    }
    return expanded.sort((a, b) => b.relevance_score - a.relevance_score)
  }

  applyBudget(pages, maxTokens) {
    const sorted = [...pages].sort((a, b) => {
      const priority = pageTypePriority({ frontmatter: b.frontmatter }) - pageTypePriority({ frontmatter: a.frontmatter })
      return priority || b.relevance_score - a.relevance_score
    })
    const kept = []
    let used = 0
    for (const page of sorted) {
      const cost = estimateTokens(`${page.title}\n${page.content}`)
      if (used + cost > maxTokens && kept.length > 0) continue
      kept.push(page)
      used += cost
      if (used >= maxTokens) break
    }
    return { pages: kept, budget: { used_tokens: used, max_tokens: maxTokens, dropped_count: pages.length - kept.length } }
  }

  resultPage(page, score, matchType) {
    return {
      page_id: page.id,
      id: page.id,
      type: page.frontmatter?.type || 'paper',
      title: page.frontmatter?.title || page.id,
      content: page.body || '',
      frontmatter: page.frontmatter || {},
      path: page.path,
      relevance_score: Number(score.toFixed(4)),
      match_type: matchType,
    }
  }
}
