import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull } from '../WikiStorage'
import { parseWikiMarkdown } from '../WikiMarkdown'
import { STORAGE_ERRORS } from '../../storage/StorageAdapter'
import { BOOTSTRAP_SECTIONS } from './BootstrapPlanService'

const POSITION_FIRST = 'first_in_theme'
const POSITION_SUBSEQUENT = 'subsequent_in_theme'
const POSITION_EXTERNAL = 'external_anchor'

function findEntry(plan, scholarlibDocId) {
  for (const section of BOOTSTRAP_SECTIONS) {
    const entry = (plan?.[section] || []).find((item) => item.scholarlib_doc_id === scholarlibDocId)
    if (entry) return { section, entry }
  }
  return null
}

function summariseClaims(body, limit = 200) {
  if (!body) return ''
  const trimmed = String(body).replace(/\s+/g, ' ').trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed
}

async function readPageBody(adapter, path) {
  if (!adapter || !path) return ''
  try {
    const { text } = await adapter.readTextWithMetadata(path)
    return parseWikiMarkdown(text).body || ''
  } catch (error) {
    if (error.code === STORAGE_ERRORS.NOT_FOUND) return ''
    throw error
  }
}

export class BootstrapContext {
  constructor({ adapter } = {}) {
    this.adapter = adapter || null
  }

  /**
   * Assemble bootstrap-aware context for the extraction prompt.
   * Returns a small structured object; callers decide how to render it.
   */
  async buildContext(scholarlibDocId, library, plan) {
    const located = findEntry(plan || {}, scholarlibDocId)
    if (!located) return null
    const { section, entry } = located
    const isOwn = section === 'own_papers'
    const theme = entry.theme || null

    const sameThemeIngested = theme
      ? (plan.own_papers || [])
          .concat(plan.external_anchors || [])
          .filter((row) =>
            row.scholarlib_doc_id !== scholarlibDocId
            && row.theme === theme
            && row.status === 'ingested'
            && row.paper_page_id
          )
      : []

    const adjacentPaperIds = new Set(sameThemeIngested.map((row) => row.paper_page_id))
    const pagesSidecar = await readJSONOrNull(this.adapter, WikiPaths.pagesSidecar)
    const pages = pagesSidecar?.pages || []

    const adjacentPapers = []
    for (const row of sameThemeIngested) {
      const page = pages.find((candidate) => candidate.id === row.paper_page_id)
      if (!page) continue
      const body = await readPageBody(this.adapter, page.path)
      adjacentPapers.push({
        paper_page_id: page.id,
        title: page.title || row.paper_page_id,
        key_claims_summary: summariseClaims(body),
      })
    }

    const themeConceptPages = []
    for (const page of pages) {
      const id = String(page.id || '')
      if (!id.startsWith('c_')) continue
      const body = await readPageBody(this.adapter, page.path)
      const refsAdjacentPaper = [...adjacentPaperIds].some((paperId) =>
        body.includes(paperId)
      )
      if (!refsAdjacentPaper) continue
      const claimMatches = body.match(/```scholarlib-claim/g) || []
      themeConceptPages.push({
        page_id: page.id,
        title: page.title || page.id,
        current_claims_count: claimMatches.length,
      })
    }

    const bootstrapPosition = !isOwn
      ? POSITION_EXTERNAL
      : adjacentPapers.length === 0
        ? POSITION_FIRST
        : POSITION_SUBSEQUENT

    return {
      is_own_paper: isOwn,
      theme,
      adjacent_papers: adjacentPapers,
      theme_concept_pages: themeConceptPages,
      bootstrap_position: bootstrapPosition,
      section,
    }
  }

  static directiveFor(context) {
    if (!context) return null
    if (context.bootstrap_position === POSITION_EXTERNAL) {
      return [
        'This is a foundational external paper.',
        'Add authoritative cross-references to existing concept pages; be conservative about creating new concepts.',
      ].join(' ')
    }
    const lines = []
    if (context.is_own_paper) {
      lines.push('This paper is authored by the user (Ali). Voice anchors and methodological commitments matter.')
    }
    if (context.bootstrap_position === POSITION_FIRST) {
      lines.push('This paper opens the theme. Concept pages will be created from scratch; bias toward producing complete, well-defined concept page foundations.')
    }
    if (context.bootstrap_position === POSITION_SUBSEQUENT) {
      lines.push('Concept pages exist for this theme. Update them by adding what this paper contributes; do not duplicate existing material.')
    }
    return lines.join(' ')
  }
}

export const BOOTSTRAP_POSITIONS = {
  FIRST: POSITION_FIRST,
  SUBSEQUENT: POSITION_SUBSEQUENT,
  EXTERNAL: POSITION_EXTERNAL,
}
