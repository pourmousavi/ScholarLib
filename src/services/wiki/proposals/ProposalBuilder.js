import { ulid } from 'ulid'
import { PageStore, slugify } from '../PageStore'
import { RiskTierer } from '../RiskTierer'
import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull } from '../WikiStorage'
import { ProposalStore } from './ProposalStore'
import { ClaimVerifier } from './ClaimVerifier'

function createPageId(type) {
  const prefixes = { paper: 'p', concept: 'c', method: 'm', dataset: 'd', person: 'pe', position_draft: 'po' }
  return `${prefixes[type] || 'p'}_${ulid()}`
}

function wikilinks(body) {
  return [...String(body || '').matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1])
}

function isIdLink(target) {
  return /^(c|m|d|pe|p|g|q|po|a)_[0-9A-HJKMNP-TV-Z]{10,}$/i.test(target)
}

/**
 * Render a string for inclusion in a YAML scalar inside a fenced block.
 * Quotes anything that contains characters YAML treats specially or that
 * could break the surrounding ```fence.
 */
function yamlScalar(value) {
  const s = String(value ?? '')
  if (!s) return '""'
  if (s.includes('\n') || /[:#\[\]{}|>"'\\&*!%@`]/.test(s) || /^[\s-]/.test(s)) return JSON.stringify(s)
  return s
}

function buildClaimBlock(claim) {
  const claimId = typeof claim.id === 'string' && claim.id.startsWith('cl_') ? claim.id : `cl_${ulid()}`
  const lines = [
    '```scholarlib-claim',
    `id: ${claimId}`,
    `claim_text: ${yamlScalar(claim.claim_text)}`,
    `confidence: ${claim.confidence || 'medium'}`,
    `verifier_status: ${claim.verifier_status || 'unverified'}`,
  ]
  if (Array.isArray(claim.supported_by) && claim.supported_by.length) {
    lines.push('supported_by:')
    for (const ev of claim.supported_by) {
      lines.push(`  - pdf_page: ${Number.isFinite(ev.pdf_page) ? ev.pdf_page : 0}`)
      lines.push(`    char_start: ${Number.isFinite(ev.char_start) ? ev.char_start : 0}`)
      lines.push(`    char_end: ${Number.isFinite(ev.char_end) ? ev.char_end : 0}`)
      if (ev.page_text_hash) lines.push(`    page_text_hash: ${yamlScalar(ev.page_text_hash)}`)
      if (ev.quote_snippet) lines.push(`    quote_snippet: ${yamlScalar(ev.quote_snippet)}`)
    }
  }
  if (Array.isArray(claim.contradicted_by) && claim.contradicted_by.length) {
    lines.push(`contradicted_by: ${JSON.stringify(claim.contradicted_by)}`)
  }
  if (claim.contested) lines.push('contested: true')
  lines.push('```')
  return lines.join('\n')
}

function buildQuestionBlock(question) {
  const text = typeof question === 'string'
    ? question
    : (question.candidate_question || question.question || question.text || '')
  if (!String(text).trim()) return ''
  const id = typeof question === 'object' && question.id?.startsWith('qc_') ? question.id : `qc_${ulid()}`
  return ['```scholarlib-question-candidate', `id: ${id}`, `candidate_question: ${yamlScalar(text)}`, '```'].join('\n')
}

function buildBulletedSection(title, items) {
  const filtered = (items || [])
    .map((item) => (typeof item === 'string' ? item : item?.name || item?.title || item?.label || ''))
    .map((s) => String(s).trim())
    .filter(Boolean)
  if (filtered.length === 0) return ''
  return [`## ${title}`, '', ...filtered.map((s) => `- ${s}`)].join('\n')
}

/**
 * Compose the full canonical paper-page body from the model's prose summary
 * plus the structured arrays. The previous implementation stored only
 * `extraction.draft_body` in the page, dropping every claim block, methods
 * list, datasets list, concepts list, and open question — exactly the
 * information that makes a paper page useful later.
 *
 * Output shape (per design §6.2):
 *   <prose summary>
 *
 *   ## Claims
 *   ```scholarlib-claim ... ```
 *   ```scholarlib-claim ... ```
 *
 *   ## Methods used
 *   - ...
 *
 *   ## Datasets used
 *   - ...
 *
 *   ## Concepts touched
 *   - ...
 *
 *   ## Open questions
 *   ```scholarlib-question-candidate ... ```
 *
 * Unsupported claims are NOT included — they live in the proposal as
 * `canonical_action: do_not_apply` for review only, never in the canonical
 * page body (per [A-11]).
 */
function composePaperBody({ draftBody, claims = [], methods = [], datasets = [], concepts = [], openQuestions = [] }) {
  const sections = []
  const prose = String(draftBody || '').trim()
  if (prose) sections.push(prose)
  if (claims.length) {
    const blocks = ['## Claims', '', ...claims.map(buildClaimBlock)]
    sections.push(blocks.join('\n'))
  }
  const methodsSection = buildBulletedSection('Methods used', methods)
  if (methodsSection) sections.push(methodsSection)
  const datasetsSection = buildBulletedSection('Datasets used', datasets)
  if (datasetsSection) sections.push(datasetsSection)
  const conceptsSection = buildBulletedSection('Concepts touched', concepts)
  if (conceptsSection) sections.push(conceptsSection)
  if (openQuestions.length) {
    const blocks = ['## Open questions', '', ...openQuestions.map(buildQuestionBlock).filter(Boolean)]
    if (blocks.length > 2) sections.push(blocks.join('\n'))
  }
  return sections.join('\n\n').trim() + '\n'
}

/**
 * Look up an existing canonical paper page that was ingested from the same
 * ScholarLib library document, so that re-ingestion can supersede it instead
 * of silently producing a duplicate. Returns the sidecar row or null.
 *
 * Falls back to scanning page bodies when the sidecar lacks scholarlib_doc_id
 * (true for any sidecar generated before that field was added — happens once
 * per wiki and self-heals on the next sidecar regen).
 */
export async function findPaperBySourceDocId(adapter, sourceDocId) {
  if (!adapter || !sourceDocId) return null
  const sidecar = await readJSONOrNull(adapter, WikiPaths.pagesSidecar)
  const rows = sidecar?.pages || []
  const direct = rows.find((row) =>
    row.id?.startsWith('p_') && row.scholarlib_doc_id === sourceDocId && !row.archived
  )
  if (direct) return direct
  // Old sidecar without scholarlib_doc_id: read paper pages and check
  // frontmatter directly. This is slow but only happens once.
  const needsScan = rows.some((row) => row.id?.startsWith('p_') && row.scholarlib_doc_id === undefined)
  if (!needsScan) return null
  for (const row of rows) {
    if (!row.id?.startsWith('p_') || row.archived) continue
    try {
      const page = await PageStore.readPage(adapter, row.id)
      if (page.frontmatter?.scholarlib_doc_id === sourceDocId) {
        return { ...row, scholarlib_doc_id: sourceDocId }
      }
    } catch {
      // tolerate missing pages — sidecar may be stale
    }
  }
  return null
}

export class ProposalBuilder {
  constructor({ adapter, verifier, riskTierer } = {}) {
    this.adapter = adapter
    this.verifier = verifier || new ClaimVerifier()
    this.riskTierer = riskTierer || new RiskTierer()
  }

  async buildProposal(extraction, library, options = {}) {
    const store = new ProposalStore(this.adapter)
    const proposalId = store.createId()
    const pagesSidecar = await readJSONOrNull(this.adapter, WikiPaths.pagesSidecar)
    const existingIds = new Set((pagesSidecar?.pages || []).map((page) => page.id))
    const createdIds = new Set()
    const sourceDocId = extraction.draft_frontmatter?.scholarlib_doc_id
    const sourceDoc = library.documents?.[sourceDocId] || {}

    const paperId = extraction.draft_frontmatter.id || createPageId('paper')
    const baseHandle = extraction.draft_frontmatter.handle || slugify(extraction.draft_frontmatter.title || sourceDoc.metadata?.title || paperId)
    // When superseding an existing paper page the old file still occupies its
    // path on disk (we archive it via a frontmatter flip rather than deleting
    // it). Append a short suffix from the new ULID so the new file lands at a
    // unique path. Authored handles are respected verbatim.
    const handle = options.supersedeOldPaperId && !extraction.draft_frontmatter.handle
      ? `${baseHandle}-${paperId.split('_').pop().slice(-6).toLowerCase()}`
      : baseHandle
    const claims = []
    const unsupported = []
    for (const claim of extraction.claims || []) {
      let verified = { status: claim.verifier_status || 'unverified' }
      if (claim.confidence === 'high') {
        verified = await this.verifier.verifyClaim(claim, sourceDocId, this.adapter, {
          sensitivity: extraction.draft_frontmatter.sensitivity || 'public',
          allowedProviders: extraction.draft_frontmatter.allowed_providers || ['ollama', 'claude'],
        })
      }
      const withStatus = { ...claim, verifier_status: verified.status, verifier: verified }
      if (verified.status === 'unsupported') {
        unsupported.push({ ...withStatus, canonical_action: 'do_not_apply', review_visibility: 'show_in_high_risk_section' })
      } else {
        claims.push(withStatus)
      }
    }

    const draftFrontmatter = {
      id: paperId,
      handle,
      type: 'paper',
      title: extraction.draft_frontmatter.title || sourceDoc.metadata?.title || 'Untitled',
      aliases: extraction.draft_frontmatter.aliases || [],
      schema_version: '1.0',
      created: new Date().toISOString().slice(0, 10),
      last_updated: new Date().toISOString().slice(0, 10),
      human_edited: false,
      auto_generated: true,
      scholarlib_doc_id: sourceDocId,
      doi: sourceDoc.metadata?.doi || extraction.draft_frontmatter.doi || null,
      ...extraction.draft_frontmatter,
    }

    const composedBody = composePaperBody({
      draftBody: extraction.draft_body,
      claims,
      methods: extraction.methods_used,
      datasets: extraction.datasets_used,
      concepts: extraction.concepts_touched,
      openQuestions: extraction.open_question_candidates,
    })

    // Detect sparse extractions — the model returned a JSON-shaped response
    // that passes validation but extracted essentially nothing. Common cause:
    // a small local Ollama model echoed the title and returned all-empty
    // arrays. We flag this so the RiskTierer can escalate to medium so the
    // user has to look at it before approving, instead of slipping through
    // batch auto-approve.
    const claimsCount = claims?.length || 0
    const methodsCount = extraction.methods_used?.length || 0
    const datasetsCount = extraction.datasets_used?.length || 0
    const conceptsCount = extraction.concepts_touched?.length || 0
    const proseLength = String(extraction.draft_body || '').replace(/^#.*$/gm, '').trim().length
    // Trigger only when ALL four substantive arrays are empty. A single claim
    // with an empty methods/datasets/concepts list is borderline but tolerable;
    // zero of everything is the unambiguous "model echoed the title" signal
    // we saw in the wild.
    const sparseExtraction = claimsCount === 0 && methodsCount === 0 && datasetsCount === 0 && conceptsCount === 0

    const paperChange = {
      change_id: `ch_${ulid()}`,
      operation: existingIds.has(paperId) ? 'modify' : 'create',
      page_id: paperId,
      page_type: 'paper',
      target_path: WikiPaths.page(paperId, 'paper', handle),
      expected_base_hash: null,
      expected_base_revision: null,
      draft_frontmatter: draftFrontmatter,
      draft_body: composedBody,
      diff_summary: `Created paper page with ${claims.length} claim${claims.length === 1 ? '' : 's'}`,
      claims_added: claims,
      claims_added_unsupported: unsupported,
      wikilinks_to: wikilinks(composedBody),
      is_creation: !existingIds.has(paperId),
      is_deletion: false,
      extraction_quality: sparseExtraction
        ? {
            sparse: true,
            reason: `Model returned ${claimsCount} claim${claimsCount === 1 ? '' : 's'}, ${methodsCount} method${methodsCount === 1 ? '' : 's'}, ${datasetsCount} dataset${datasetsCount === 1 ? '' : 's'}, ${conceptsCount} concept${conceptsCount === 1 ? '' : 's'} — likely a model-quality issue, consider re-ingesting with a stronger model`,
            totals: {
              claims: claimsCount,
              methods: methodsCount,
              datasets: datasetsCount,
              concepts: conceptsCount,
              prose_chars: proseLength,
            },
          }
        : { sparse: false },
    }
    createdIds.add(paperId)

    this._validateWikilinks(paperChange, existingIds, createdIds)
    const risk = this.riskTierer.reasonForChange(paperChange, null, extraction.extraction_metadata)
    paperChange.risk_tier = unsupported.length > 0 ? 'high' : risk.tier
    paperChange.risk_reason = unsupported.length > 0 ? 'Verifier rejected one or more claims' : risk.reason

    const pageChanges = [paperChange]

    // Supersede an older paper page for the same source document. The old
    // page is not deleted — it gets `archived: true` + `archive_reason:
    // superseded` + `superseded_by: <new id>` so the link graph stays intact
    // and the chat retrieval can opt out of archived pages.
    if (options.supersedeOldPaperId) {
      const archiveChange = await this._buildArchiveChange(options.supersedeOldPaperId, paperId)
      if (archiveChange) pageChanges.push(archiveChange)
    }

    const proposal = {
      proposal_id: proposalId,
      created_at: new Date().toISOString(),
      source: {
        scholarlib_doc_id: sourceDocId,
        title: sourceDoc.metadata?.title || draftFrontmatter.title,
        doi: sourceDoc.metadata?.doi || draftFrontmatter.doi || null,
      },
      extraction_metadata: extraction.extraction_metadata,
      bootstrap_context: extraction.bootstrap_context || null,
      page_changes: pageChanges,
      candidate_records: {
        question_candidates: extraction.open_question_candidates || [],
        author_entries: sourceDoc.metadata?.authors || [],
        contradiction_signals: extraction.contradiction_signals || [],
      },
      schema_version: '1.0',
    }
    await store.save(proposal)
    return proposalId
  }

  async _buildArchiveChange(oldPageId, newPageId) {
    let oldPage
    try {
      oldPage = await PageStore.readPage(this.adapter, oldPageId)
    } catch (error) {
      // Old page does not exist — nothing to archive. The supersede signal
      // is now meaningless but we silently drop it rather than failing the
      // whole ingestion.
      return null
    }
    const today = new Date().toISOString().slice(0, 10)
    const updatedFrontmatter = {
      ...oldPage.frontmatter,
      archived: true,
      archive_reason: 'superseded',
      superseded_by: newPageId,
      last_updated: today,
    }
    return {
      change_id: `ch_${ulid()}`,
      operation: 'modify',
      page_id: oldPageId,
      page_type: oldPage.frontmatter?.type || 'paper',
      target_path: oldPage.path,
      expected_base_hash: oldPage.hash,
      expected_base_revision: oldPage.storage?.revision ?? null,
      draft_frontmatter: updatedFrontmatter,
      draft_body: oldPage.body,
      diff_summary: `Archived as superseded by ${newPageId}`,
      claims_added: [],
      claims_added_unsupported: [],
      wikilinks_to: wikilinks(oldPage.body),
      is_creation: false,
      is_deletion: false,
      risk_tier: 'low',
      risk_reason: 'Frontmatter-only archive flag flip',
    }
  }

  _validateWikilinks(change, existingIds, createdIds) {
    for (const target of change.wikilinks_to || []) {
      if (!isIdLink(target)) throw new Error(`Unresolved alias-style wikilink: [[${target}]]`)
      if (!existingIds.has(target) && !createdIds.has(target)) {
        throw new Error(`Wikilink target does not exist in proposal or sidecars: ${target}`)
      }
    }
  }
}

export { wikilinks, isIdLink, createPageId }
