import { ProposalStore } from './ProposalStore'
import { ProposalApplier } from './ProposalApplier'

function tierBuckets(changes) {
  const counts = { low: 0, medium: 0, high: 0 }
  for (const change of changes || []) {
    const tier = change.risk_tier || 'low'
    if (counts[tier] != null) counts[tier] += 1
  }
  return counts
}

export class ProposalReviewSubmitter {
  constructor({ adapter, proposalStore, proposalApplier } = {}) {
    if (!adapter && !proposalStore) throw new Error('ProposalReviewSubmitter requires an adapter or proposal store')
    this.adapter = adapter
    this.proposalStore = proposalStore || new ProposalStore(adapter)
    this.proposalApplier = proposalApplier || new ProposalApplier({ adapter, proposalStore: this.proposalStore })
  }

  async submit({
    proposalId,
    approvedChangeIds = [],
    rejectedChangeIds = [],
    perChangeEdits = {},
    reviewTracking = null,
    rejectAll = false,
  }) {
    const proposal = await this.proposalStore.read(proposalId)
    if (!proposal) return { status: 'not_found' }
    const allChanges = proposal.page_changes || []
    const approvedSet = new Set(approvedChangeIds)
    const rejectedSet = new Set(rejectedChangeIds)
    const explicitTouched = new Set([...approvedSet, ...rejectedSet])
    const remainingChanges = allChanges.filter((change) => !approvedSet.has(change.change_id) && !rejectedSet.has(change.change_id))

    if (rejectAll) {
      await this.proposalStore.archive(proposalId, 'rejected')
      return { status: 'rejected', applied_changes: [], remainder_proposal_id: null }
    }

    if (approvedSet.size === 0) {
      await this.proposalStore.archive(proposalId, 'rejected')
      return { status: 'rejected', applied_changes: [], remainder_proposal_id: null }
    }

    const remainder = [...remainingChanges, ...allChanges.filter((change) => rejectedSet.has(change.change_id) && false)]

    let remainderId = null
    if (remainder.length > 0) {
      const newId = this.proposalStore.createId()
      const derived = {
        ...proposal,
        proposal_id: newId,
        created_at: new Date().toISOString(),
        page_changes: remainder,
        parent_proposal_id: proposalId,
        derived_from: {
          proposal_id: proposalId,
          reason: 'partial_review_remainder',
          approved_change_ids: [...approvedSet],
          rejected_change_ids: [...rejectedSet],
        },
      }
      await this.proposalStore.save(derived)
      remainderId = newId
    }

    const trackingMetadata = reviewTracking
      ? {
          review_started_at: reviewTracking.startedAt || null,
          review_ended_at: reviewTracking.endedAt || new Date().toISOString(),
          review_duration_seconds_human: Number(reviewTracking.durationSeconds || 0),
          tier_counts: tierBuckets(allChanges.filter((change) => approvedSet.has(change.change_id))),
          remainder_proposal_id: remainderId,
        }
      : { remainder_proposal_id: remainderId }

    const result = await this.proposalApplier.applyProposal(proposalId, {
      mode: 'selected',
      selected_change_ids: [...approvedSet],
      per_change_edits: perChangeEdits,
      operation_metadata: trackingMetadata,
    })

    return {
      status: result.status || 'applied',
      committed_op_id: result.committed_op_id || null,
      applied_changes: result.applied_changes || [],
      sidecar_status: result.sidecar_status || null,
      remainder_proposal_id: remainderId,
      review_tracking: trackingMetadata,
      rejected_change_ids: [...rejectedSet],
      pending_change_ids: remainingChanges.map((change) => change.change_id),
      explicit_touched_count: explicitTouched.size,
    }
  }
}
