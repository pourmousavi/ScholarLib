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

export class ProposalBuilder {
  constructor({ adapter, verifier, riskTierer } = {}) {
    this.adapter = adapter
    this.verifier = verifier || new ClaimVerifier()
    this.riskTierer = riskTierer || new RiskTierer()
  }

  async buildProposal(extraction, library) {
    const store = new ProposalStore(this.adapter)
    const proposalId = store.createId()
    const pagesSidecar = await readJSONOrNull(this.adapter, WikiPaths.pagesSidecar)
    const existingIds = new Set((pagesSidecar?.pages || []).map((page) => page.id))
    const createdIds = new Set()
    const sourceDocId = extraction.draft_frontmatter?.scholarlib_doc_id
    const sourceDoc = library.documents?.[sourceDocId] || {}

    const paperId = extraction.draft_frontmatter.id || createPageId('paper')
    const handle = extraction.draft_frontmatter.handle || slugify(extraction.draft_frontmatter.title || sourceDoc.metadata?.title || paperId)
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

    const paperChange = {
      change_id: `ch_${ulid()}`,
      operation: existingIds.has(paperId) ? 'modify' : 'create',
      page_id: paperId,
      page_type: 'paper',
      target_path: WikiPaths.page(paperId, 'paper', handle),
      expected_base_hash: null,
      expected_base_revision: null,
      draft_frontmatter: draftFrontmatter,
      draft_body: extraction.draft_body,
      diff_summary: `Created paper page with ${claims.length} claim${claims.length === 1 ? '' : 's'}`,
      claims_added: claims,
      claims_added_unsupported: unsupported,
      wikilinks_to: wikilinks(extraction.draft_body),
      is_creation: !existingIds.has(paperId),
      is_deletion: false,
    }
    createdIds.add(paperId)

    this._validateWikilinks(paperChange, existingIds, createdIds)
    const risk = this.riskTierer.reasonForChange(paperChange, null, extraction.extraction_metadata)
    paperChange.risk_tier = unsupported.length > 0 ? 'high' : risk.tier
    paperChange.risk_reason = unsupported.length > 0 ? 'Verifier rejected one or more claims' : risk.reason

    const proposal = {
      proposal_id: proposalId,
      created_at: new Date().toISOString(),
      source: {
        scholarlib_doc_id: sourceDocId,
        title: sourceDoc.metadata?.title || draftFrontmatter.title,
        doi: sourceDoc.metadata?.doi || draftFrontmatter.doi || null,
      },
      extraction_metadata: extraction.extraction_metadata,
      page_changes: [paperChange],
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
