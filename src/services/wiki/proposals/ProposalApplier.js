import { ulid } from 'ulid'
import { StorageError, STORAGE_ERRORS } from '../../storage/StorageAdapter'
import { OperationLogService } from '../OperationLogService'
import { PageStore } from '../PageStore'
import { SidecarService } from '../SidecarService'
import { stringifyWikiMarkdown } from '../WikiMarkdown'
import { WikiStateService } from '../WikiStateService'
import { CostEstimator } from '../CostEstimator'
import { ProposalStore } from './ProposalStore'
import { wikilinks, isIdLink } from './ProposalBuilder'

export class ProposalApplyConflictError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ProposalApplyConflictError'
    this.code = 'WIKI_PROPOSAL_CONFLICT'
    this.details = details
  }
}

export class ProposalApplier {
  constructor({ adapter, proposalStore, costEstimator } = {}) {
    this.adapter = adapter
    this.proposalStore = proposalStore || new ProposalStore(adapter)
    this.costEstimator = costEstimator || new CostEstimator({ adapter })
  }

  async applyProposal(proposalId, approval = { mode: 'all' }) {
    const proposal = await this.proposalStore.read(proposalId)
    if (!proposal) return { status: 'not_found', applied_changes: [] }
    if (proposal.archive_status === 'accepted') return { status: 'already_applied', applied_changes: [] }

    const changes = this._selectedChanges(proposal, approval)
    if (changes.length === 0) {
      await this.proposalStore.archive(proposalId, 'rejected')
      return { status: 'rejected', applied_changes: [] }
    }
    await this._validate(changes)

    const extraMetadata = approval.operation_metadata && typeof approval.operation_metadata === 'object'
      ? approval.operation_metadata
      : {}
    const operation = OperationLogService.createPendingOperation({
      type: 'wiki_ingestion',
      pageWrites: changes.map((change) => ({ page_id: change.page_id, path: change.target_path })),
      metadata: { proposal_id: proposalId, ...extraMetadata },
    })
    operation.id = ulid()
    await OperationLogService.writePending(this.adapter, operation)

    const applied = []
    try {
      for (const change of this._orderedChanges(changes)) {
        const edited = approval.per_change_edits?.[change.change_id]
        const frontmatter = edited?.edited_frontmatter || change.draft_frontmatter
        const body = edited?.edited_body || change.draft_body
        const expected = change.expected_base_revision ?? null
        if (change.operation === 'modify') {
          const current = await PageStore.readPage(this.adapter, change.page_id)
          if (change.expected_base_hash && current.hash !== change.expected_base_hash) {
            throw new ProposalApplyConflictError(`Base hash mismatch for ${change.page_id}`, { change_id: change.change_id })
          }
        }
        const text = stringifyWikiMarkdown(frontmatter, body)
        const metadata = await this.adapter.writeTextIfRevision(change.target_path, text, expected)
        applied.push({ change_id: change.change_id, page_id: change.page_id, revision: metadata.revision })
      }
    } catch (error) {
      operation.state = 'failed'
      operation.failed_at = new Date().toISOString()
      operation.failure = { message: error.message, code: error.code || null }
      await OperationLogService.writePending(this.adapter, operation)
      throw error
    }

    let sidecarStatus = { ok: true }
    try {
      const sidecars = await SidecarService.regenerate(this.adapter)
      sidecarStatus = { ok: true, pages: sidecars.pages.count }
    } catch (error) {
      sidecarStatus = { ok: false, message: error.message, code: error.code || null }
      await WikiStateService.enterSafetyMode(this.adapter, `Sidecar regeneration failed for proposal ${proposalId}: ${error.message}`)
    }

    await OperationLogService.commit(this.adapter, operation, {
      applied_changes: applied,
      sidecar_status: sidecarStatus,
      unsupported_claims: changes.flatMap((change) => change.claims_added_unsupported || []),
    })
    await this.proposalStore.archive(proposalId, 'accepted')
    await this.costEstimator.recordCall({ provider: 'internal', model: 'proposal-applier', task: 'apply_proposal', metadata: { proposal_id: proposalId } })

    return { committed_op_id: operation.id, applied_changes: applied, sidecar_status: sidecarStatus }
  }

  _selectedChanges(proposal, approval) {
    if (approval.mode === 'selected') {
      const selected = new Set(approval.selected_change_ids || [])
      return proposal.page_changes.filter((change) => selected.has(change.change_id))
    }
    return proposal.page_changes
  }

  async _validate(changes) {
    for (const change of changes) {
      for (const target of wikilinks(change.draft_body)) {
        if (!isIdLink(target)) throw new ProposalApplyConflictError(`Alias-style wikilink is not allowed: [[${target}]]`)
      }
      if (change.operation === 'create') {
        try {
          await this.adapter.getMetadata(change.target_path)
          throw new ProposalApplyConflictError(`Target page already exists: ${change.target_path}`)
        } catch (error) {
          if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
        }
      }
    }
  }

  _orderedChanges(changes) {
    return [...changes].sort((a, b) => {
      if (a.operation !== b.operation) return a.operation === 'create' ? -1 : 1
      return a.page_id.localeCompare(b.page_id)
    })
  }
}

export { StorageError }
