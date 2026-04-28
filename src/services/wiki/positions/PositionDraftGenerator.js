import { ulid } from 'ulid'
import { ProviderRouter } from '../ProviderRouter'
import { CostEstimator, CostCapExceededError } from '../CostEstimator'
import { SensitivityViolationError } from '../SensitivityGate'
import { PageStore } from '../PageStore'
import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from '../WikiStorage'
import { PositionDraftService } from './PositionDraftService'

export class PositionDraftGenerationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'PositionDraftGenerationError'
    this.code = code
    this.details = details
  }
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4)
}

function pickAnchorPapers(library, conceptId, limit = 3) {
  const docs = Object.values(library?.documents || {})
  const matched = docs.filter((doc) => {
    const concepts = doc?.wiki?.concepts_touched || []
    return concepts.includes(conceptId)
  })
  const ranked = matched.length > 0 ? matched : docs
  return ranked.slice(0, limit)
}

function defaultPrompt({ conceptPage, anchors, conceptId, theme }) {
  return [
    {
      role: 'system',
      content: 'You draft ScholarLib position pages in the user\'s voice. Output markdown only — no commentary, no fenced code, no apologies. Mark every contestable claim with a TODO[claim] tag for human review.',
    },
    {
      role: 'user',
      content: [
        `Theme: ${theme || conceptId}`,
        `Existing concept page (${conceptId}):\n${conceptPage?.body || '(none)'}`,
        `Voice anchors (recent abstracts):\n${anchors.map((doc) => `- ${doc.metadata?.title}: ${doc.metadata?.abstract || ''}`).join('\n')}`,
        'Produce a position draft of 400–700 words. End with a "Caveats" section. Frontmatter is added by the caller.',
      ].join('\n\n'),
    },
  ]
}

export class PositionDraftGenerator {
  constructor({ adapter, providerRouter, costEstimator, llmClient, draftService } = {}) {
    if (!adapter) throw new Error('PositionDraftGenerator requires a storage adapter')
    this.adapter = adapter
    this.providerRouter = providerRouter || new ProviderRouter()
    this.costEstimator = costEstimator || new CostEstimator({ adapter })
    this.llmClient = llmClient || { chat: async () => 'Draft generation requires a configured LLM client.' }
    this.draftService = draftService || new PositionDraftService(adapter)
  }

  async generate({ conceptId, theme, library, qualifyingChecklists = [] } = {}) {
    if (!conceptId) throw new PositionDraftGenerationError('MISSING_CONCEPT', 'conceptId is required')
    if (qualifyingChecklists.length === 0) {
      throw new PositionDraftGenerationError('NO_QUALIFYING_PAPERS', `No ingested papers touch concept ${conceptId}`)
    }

    let conceptPage = null
    try {
      conceptPage = await PageStore.readPage(this.adapter, conceptId)
    } catch (error) {
      if (error.code !== 'STORAGE_NOT_FOUND') throw error
    }

    const anchors = pickAnchorPapers(library, conceptId)
    const messages = defaultPrompt({ conceptPage, anchors, conceptId, theme })

    let route
    try {
      route = await this.providerRouter.route('synthesise_position', {
        sensitivity: conceptPage?.frontmatter?.sensitivity || 'public',
        allowedProviders: conceptPage?.frontmatter?.allowed_providers || ['ollama', 'claude'],
        estimatedTokensIn: estimateTokens(messages.map((message) => message.content).join('\n')),
        estimatedTokensOut: 1500,
      })
    } catch (error) {
      if (error instanceof SensitivityViolationError) throw error
      if (error instanceof CostCapExceededError) throw error
      if (error?.code === 'WIKI_SENSITIVITY_VIOLATION' || error?.code === 'WIKI_COST_CAP_EXCEEDED') throw error
      throw error
    }

    const response = await this.llmClient.chat(messages, route.model, route.callOptions, route.provider)
    const draftId = `po_${ulid()}`
    const handle = `${conceptId}-position-${draftId}`
    const frontmatter = {
      id: draftId,
      type: 'position_draft',
      title: theme || conceptPage?.frontmatter?.title || conceptId,
      handle,
      schema_version: '1.0',
      created: new Date().toISOString().slice(0, 10),
      last_updated: new Date().toISOString().slice(0, 10),
      voice_status: 'draft_requires_human_edit',
      scope: 'private',
      share_review_status: 'not_reviewed',
      sources: anchors.map((doc) => doc.id || doc.metadata?.scholarlib_doc_id).filter(Boolean),
      auto_generated: true,
      provider: route.provider,
      model: route.model,
      concept_id: conceptId,
    }

    const draft = await this.draftService.writeDraft(handle, frontmatter, String(response || ''))
    return { draft_id: draftId, handle, draft, route }
  }

  async recordReview(draftId, review) {
    if (!draftId) throw new Error('recordReview requires draftId')
    const record = {
      draft_id: draftId,
      theme: review.theme || null,
      user_rating: review.user_rating ?? null,
      user_observations: review.user_observations || '',
      would_edit_to_keep: review.would_edit_to_keep ?? null,
      voice_match_assessment: review.voice_match_assessment || '',
      factual_accuracy_assessment: review.factual_accuracy_assessment || '',
      recorded_at: new Date().toISOString(),
    }
    await this.adapter.createFolder(WikiPaths.phase1PositionDraftsReviewRoot)
    await writeJSONWithRevision(this.adapter, WikiPaths.phase1PositionDraftReview(draftId), record)
    return record
  }

  async listReviews() {
    let entries
    try {
      entries = await this.adapter.listFolder(WikiPaths.phase1PositionDraftsReviewRoot)
    } catch {
      return []
    }
    const records = []
    for (const entry of entries.filter((row) => row.type === 'file' && row.name.endsWith('.json'))) {
      const record = await readJSONOrNull(this.adapter, `${WikiPaths.phase1PositionDraftsReviewRoot}/${entry.name}`)
      if (record) records.push(record)
    }
    return records
  }
}
