import { ulid } from 'ulid'
import { ollamaService } from '../../ai/OllamaService'
import { PageStore, slugify } from '../PageStore'
import { ProviderRouter } from '../ProviderRouter'
import { WikiPaths } from '../WikiPaths'
import { hashJson } from '../WikiHash'
import { writeJSONWithRevision } from '../WikiStorage'
import { PdfTextExtractor } from '../extraction/PdfTextExtractor'
import { GrantNamespacePolicy } from './GrantNamespacePolicy'

export const GRANT_SUMMARY_PROMPT_v1 = `You are summarising a grant application into a structured markdown
summary. Output only markdown, no preamble, no postamble.

## Project Title
## Investigators
## Aims
- numbered list

## Methodology
- 3 to 5 short bullets

## Innovation
## Expected Outcomes
## Budget And Partners
- requested_cash: <amount or "not extracted">
- in_kind_contribution: <amount or "not extracted">
- partner_contribution: <amount or "not extracted">
- total_project_value: <amount or "not extracted">

## Risks

Constraints:
- Stay under 800 words total.
- Where a section is not visible in the source, write
  "not extracted" rather than guessing.
- Do not invent investigators, dollar amounts, or aims.`

const OUTCOMES = new Set(['pending', 'under_review', 'won', 'rejected', 'withdrawn', 'other'])
const RELATED_RELATIONS = new Set(['application_pdf', 'outcome_notice', 'reviewer_feedback', 'budget_attachment', 'support_letter', 'appendix', 'other'])
const GRANT_OLLAMA_REQUIRED_MESSAGE = 'Grant PDF extraction requires local Ollama because grant content is confidential. Start Ollama and re-ingest, or attach a markdown summary as ai_chat_source_file.'

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4)
}

function isPdfDocument(document) {
  return /\.pdf(?:$|\?)/i.test(document?.box_path || document?.filename || '')
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function sectionPattern(level, headingText) {
  const hashes = '#'.repeat(level)
  const escaped = String(headingText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^${hashes}\\s+${escaped}\\s*\\n)([\\s\\S]*?)(?=^#{1,6}\\s+|\\s*$)`, 'm')
}

export function replaceOrAppendSection(body, headingLevel, headingText, content) {
  const text = String(body || '').trimEnd()
  const heading = `${'#'.repeat(headingLevel)} ${headingText}`
  const replacement = `${heading}\n\n${String(content ?? '').trim()}\n`
  const pattern = sectionPattern(headingLevel, headingText)
  if (pattern.test(text)) {
    return `${text.replace(pattern, replacement).trimEnd()}\n`
  }
  return `${[text, replacement].filter(Boolean).join('\n\n').trimEnd()}\n`
}

function appendSection(body, headingLevel, headingText, content) {
  const heading = `${'#'.repeat(headingLevel)} ${headingText}`
  return `${[String(body || '').trimEnd(), `${heading}\n\n${String(content ?? '').trim()}`].filter(Boolean).join('\n\n').trimEnd()}\n`
}

function sectionContent(body, headingLevel, headingText) {
  const match = String(body || '').match(sectionPattern(headingLevel, headingText))
  return match ? match[2].trim() : ''
}

function sourceDocumentsSection(sourceDoc) {
  if (!sourceDoc?.id && !sourceDoc?.filename) return '- application_pdf - not recorded'
  return [
    `- application_pdf - ${sourceDoc.filename || sourceDoc.title || sourceDoc.id}`,
    sourceDoc.id ? `  - scholarlib_doc_id: ${sourceDoc.id}` : null,
  ].filter(Boolean).join('\n')
}

function createDefaultGrantLLMClient() {
  return {
    chat(messages, model, callOptions) {
      return ollamaService.chat(messages, model, callOptions)
    },
    isAvailable: (force) => ollamaService.isAvailable(force),
    getLastError: () => ollamaService.getLastError(),
  }
}

function ingestionResult(page, alreadyIngested) {
  return { ...page, page, alreadyIngested }
}

export class GrantOllamaRequiredError extends Error {
  constructor(message = GRANT_OLLAMA_REQUIRED_MESSAGE) {
    super(message)
    this.name = 'GrantOllamaRequiredError'
    this.code = 'GRANT_OLLAMA_REQUIRED'
  }
}

export class GrantIngestion {
  constructor({
    adapter,
    pageStore = PageStore,
    policy = GrantNamespacePolicy,
    pdfTextExtractor,
    providerRouter,
    llmClient,
  } = {}) {
    if (!adapter) throw new Error('GrantIngestion requires a storage adapter')
    this.adapter = adapter
    this.pageStore = pageStore
    this.policy = policy
    this.pdfTextExtractor = pdfTextExtractor || new PdfTextExtractor()
    this.providerRouter = providerRouter || new ProviderRouter()
    this.llmClient = llmClient || createDefaultGrantLLMClient()
  }

  async ingestGrant({
    title,
    body = '',
    provider = 'ollama',
    funder = '',
    program = '',
    submitted = '',
    outcome = 'pending',
    outcome_other = '',
    reviewer_feedback = '',
    themes = [],
    related_papers = [],
    related_concepts = [],
    related_source_docs = [],
    source_doc_id = '',
    source_box_path = '',
    source_filename = '',
  }) {
    this.policy.assertProviderAllowed(provider)
    const id = `g_${ulid()}`
    const frontmatter = this.policy.defaultFrontmatter({
      id,
      handle: slugify(title),
      title,
      funder,
      program,
      submitted,
      outcome,
      outcome_other,
      reviewer_feedback: reviewer_feedback || '',
      themes,
      related_papers,
      related_concepts,
      related_source_docs,
      source_doc_id,
      source_box_path,
      source_filename,
    })
    return this.pageStore.writePage(this.adapter, {
      id,
      type: 'grant',
      title,
      handle: frontmatter.handle,
      frontmatter,
      body,
    })
  }

  async ingestDocument(document, options = {}) {
    if (!document?.id) throw new Error('GrantIngestion.ingestDocument requires a document')
    const existing = await this._findGrantBySourceDocId(document.id)
    if (existing) return ingestionResult(existing, true)

    if (options.confirmDuplicate !== true) {
      const fuzzy = await this._findFuzzyDuplicate(document)
      if (fuzzy) {
        const error = new Error('A grant with the same funder/program/year/title already exists. Continue?')
        error.code = 'GRANT_POSSIBLE_DUPLICATE'
        error.page = fuzzy
        throw error
      }
    }

    const metadata = document.metadata || {}
    const extracted = await this.extractDocumentBody(document)
    const relatedSourceDocs = [{
      scholarlib_doc_id: document.id,
      relation: 'application_pdf',
      title: document.filename || metadata.title || document.id,
      added_at: today(),
    }]
    const body = this.buildBody(extracted, metadata.reviewer_feedback || '', document)
    const page = await this.ingestGrant({
      title: metadata.title || document.filename || document.id,
      body,
      provider: options.provider || 'ollama',
      funder: metadata.funder || metadata.sponsor || '',
      program: metadata.program || metadata.scheme || '',
      submitted: metadata.submitted || metadata.year || '',
      outcome: OUTCOMES.has(metadata.outcome) ? metadata.outcome : 'pending',
      outcome_other: metadata.outcome && !OUTCOMES.has(metadata.outcome) ? metadata.outcome : '',
      reviewer_feedback: metadata.reviewer_feedback || '',
      themes: metadata.keywords || document.user_data?.tags || [],
      related_papers: [],
      related_concepts: [],
      related_source_docs: relatedSourceDocs,
      source_doc_id: document.id,
      source_box_path: document.box_path || '',
      source_filename: document.filename || '',
    })
    return ingestionResult(page, false)
  }

  async updateGrantFields(grantPageId, {
    outcome = 'pending',
    outcome_other = '',
    reviewer_feedback = '',
    outcome_notes = '',
  } = {}) {
    if (!OUTCOMES.has(outcome)) throw new Error(`Invalid grant outcome: ${outcome}`)
    const page = await this.pageStore.readPage(this.adapter, grantPageId)
    const now = new Date().toISOString()
    let body = replaceOrAppendSection(page.body, 2, 'Reviewer Feedback', reviewer_feedback)
    body = replaceOrAppendSection(body, 2, 'Outcome Notes', outcome_notes)
    return this.pageStore.writePage(this.adapter, {
      ...page,
      title: page.frontmatter?.title || grantPageId,
      handle: page.frontmatter?.handle,
      type: 'grant',
      frontmatter: {
        ...page.frontmatter,
        outcome,
        outcome_other: outcome === 'other' ? outcome_other : '',
        reviewer_feedback,
        human_edited: true,
        last_human_review: now,
        last_updated: now,
      },
      body,
    }, page.storage?.revision)
  }

  async attachRelatedDocument(grantPageId, scholarlibDocId, {
    relation = 'other',
    title = '',
    extractBody = true,
    library,
  } = {}) {
    if (!RELATED_RELATIONS.has(relation)) throw new Error(`Invalid related document relation: ${relation}`)
    const document = library?.documents?.[scholarlibDocId]
    if (!document) throw new Error(`Document not found: ${scholarlibDocId}`)
    const page = await this.pageStore.readPage(this.adapter, grantPageId)
    const existing = page.frontmatter?.related_source_docs || []
    const nextEntry = {
      scholarlib_doc_id: scholarlibDocId,
      relation,
      title: title || document.metadata?.title || document.filename || scholarlibDocId,
      added_at: today(),
    }
    const alreadyAttached = existing.some((entry) => entry.scholarlib_doc_id === scholarlibDocId)
    const related_source_docs = alreadyAttached ? existing : [...existing, nextEntry]
    let body = page.body
    if (!alreadyAttached && extractBody && isPdfDocument(document) && (relation === 'outcome_notice' || relation === 'reviewer_feedback')) {
      const summary = await this._summarisePdf(document)
      const heading = relation === 'reviewer_feedback'
        ? `Reviewer Feedback (from ${document.filename || nextEntry.title})`
        : `Outcome Notes (from ${document.filename || nextEntry.title})`
      body = appendSection(body, 2, heading, summary)
    }
    const now = new Date().toISOString()
    return this.pageStore.writePage(this.adapter, {
      ...page,
      title: page.frontmatter?.title || grantPageId,
      handle: page.frontmatter?.handle,
      type: 'grant',
      frontmatter: {
        ...page.frontmatter,
        related_source_docs,
        human_edited: true,
        last_human_review: now,
        last_updated: now,
      },
      body,
    }, page.storage?.revision)
  }

  async extractDocumentBody(document) {
    if (document.ai_chat_source_file) {
      try {
        const blob = await this.adapter.downloadFile(document.ai_chat_source_file)
        const text = await blob.text()
        if (text.trim()) return `## Source Notes\n\n${text.trim()}`
      } catch (error) {
        console.warn('Failed to read grant source markdown:', error)
      }
    }

    if (isPdfDocument(document)) {
      const summary = await this._summarisePdf(document)
      return `## Generated Application Summary\n\n${summary.trim()}`
    }

    const metadata = document.metadata || {}
    const fallback = metadata.abstract || metadata.summary || document.notes || 'Grant document registered from ScholarLib. Add summary, reviewer feedback, and outcome details as they become available.'
    return `## Source Notes\n\n${fallback}`
  }

  buildBody(extractedBody, reviewerFeedback, document) {
    let body = `## Source Documents\n\n${sourceDocumentsSection(document)}\n`
    const extracted = String(extractedBody || '').trim()
    body = `${body.trimEnd()}\n\n${extracted || '## Source Notes\n\nNo source notes provided.'}\n`
    body = replaceOrAppendSection(body, 2, 'Reviewer Feedback', reviewerFeedback || '')
    body = replaceOrAppendSection(body, 2, 'Outcome Notes', sectionContent(body, 2, 'Outcome Notes'))
    return body
  }

  async _summarisePdf(document) {
    const pdf = await this.pdfTextExtractor.extractPdf(this.adapter, document.box_path)
    const pdf_text_hash = await hashJson({
      prompt_version: 'GRANT_SUMMARY_PROMPT_v1',
      pages: pdf.pages.map((page) => ({ index: page.index, page_text_hash: page.page_text_hash })),
    })
    const cached = await this._findCachedGrantSummary(pdf_text_hash)
    if (cached) return cached

    this.policy.assertProviderAllowed('ollama')
    const pageText = this._fitContext(pdf.pages)
    const route = await this.providerRouter.route('extract_paper', {
      namespace: '_private/grant',
      sensitivity: 'confidential',
      allowedProviders: ['ollama'],
      estimatedTokensIn: estimateTokens(pageText),
      estimatedTokensOut: 1200,
    })
    this.policy.assertProviderAllowed(route.provider)
    const available = this.llmClient?.isAvailable ? await this.llmClient.isAvailable(true) : true
    if (!available) throw new GrantOllamaRequiredError()
    const response = await this.llmClient.chat([
      { role: 'system', content: GRANT_SUMMARY_PROMPT_v1 },
      { role: 'user', content: `Document metadata:\n${JSON.stringify(document.metadata || {}, null, 2)}\n\nPDF text:\n${pageText}` },
    ], route.model, route.callOptions)
    const summary = String(response || '').trim() || 'not extracted'
    await this._cacheGrantSummary({ pdf_text_hash, summary, document, route })
    return summary
  }

  _fitContext(pages) {
    const rendered = pages.map((page) => `PAGE ${page.index + 1} [${page.page_text_hash}]\n${page.text}`).join('\n\n')
    if (estimateTokens(rendered) <= 24000) return rendered
    return pages.map((page) => `PAGE ${page.index + 1} [${page.page_text_hash}]\n${page.text.slice(0, 6000)}`).join('\n\n')
  }

  async _findGrantBySourceDocId(sourceDocId) {
    const pages = await this.pageStore.listPages(this.adapter)
    return pages.find((page) => page.frontmatter?.type === 'grant' && page.frontmatter?.source_doc_id === sourceDocId) || null
  }

  async _findFuzzyDuplicate(document) {
    const metadata = document.metadata || {}
    const key = [
      metadata.funder || metadata.sponsor || '',
      metadata.program || metadata.scheme || '',
      metadata.submitted || metadata.year || '',
      metadata.title || document.filename || '',
    ].map((value) => String(value || '').trim().toLowerCase()).join('|')
    if (key === '|||') return null
    const pages = await this.pageStore.listPages(this.adapter)
    return pages.find((page) => {
      if (page.frontmatter?.type !== 'grant') return false
      const pageKey = [
        page.frontmatter?.funder || '',
        page.frontmatter?.program || '',
        page.frontmatter?.submitted || '',
        page.frontmatter?.title || '',
      ].map((value) => String(value || '').trim().toLowerCase()).join('|')
      return pageKey === key && page.frontmatter?.source_doc_id !== document.id
    }) || null
  }

  async _findCachedGrantSummary(pdfTextHash, root = WikiPaths.costRoot) {
    let entries
    try {
      entries = await this.adapter.listFolder(root)
    } catch {
      return null
    }
    for (const entry of entries) {
      const path = `${root}/${entry.name}`
      if (entry.type === 'folder') {
        const nested = await this._findCachedGrantSummary(pdfTextHash, path)
        if (nested) return nested
      } else if (entry.name.endsWith('.committed.json')) {
        try {
          const record = await this.adapter.readJSON(path)
          if (
            record.namespace === 'grant_summary' &&
            record.source?.pdf_text_hash === pdfTextHash &&
            record.prompt_version === 'GRANT_SUMMARY_PROMPT_v1' &&
            record.summary_body
          ) {
            return record.summary_body
          }
        } catch {
          // Ignore malformed cache records; lint handles malformed op files separately.
        }
      }
    }
    return null
  }

  async _cacheGrantSummary({ pdf_text_hash, summary, document, route }) {
    const id = ulid()
    const createdAt = new Date()
    const record = {
      id,
      created_at: createdAt.toISOString(),
      namespace: 'grant_summary',
      provider: route.provider,
      model: route.model,
      prompt_version: 'GRANT_SUMMARY_PROMPT_v1',
      source: {
        scholarlib_doc_id: document.id,
        pdf_text_hash,
      },
      summary_body: summary,
      cost_usd: 0,
    }
    await writeJSONWithRevision(this.adapter, WikiPaths.pendingCost(id, createdAt), record)
    await writeJSONWithRevision(this.adapter, WikiPaths.committedCost(id, createdAt), { ...record, committed_at: new Date().toISOString() })
    try { await this.adapter.deleteFile(WikiPaths.pendingCost(id, createdAt)) } catch { /* already removed */ }
  }
}
