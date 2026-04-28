import { ulid } from 'ulid'
import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull, writeJSONCreateOnly, writeJSONWithRevision } from '../WikiStorage'

export class ProposalStore {
  constructor(adapter) {
    this.adapter = adapter
  }

  createId() {
    return `prop_${ulid()}`
  }

  async save(proposal) {
    await this.adapter.createFolder(WikiPaths.proposalsRoot)
    await writeJSONCreateOnly(this.adapter, WikiPaths.proposal(proposal.proposal_id), proposal)
    return proposal.proposal_id
  }

  async read(proposalId) {
    const pending = await readJSONOrNull(this.adapter, WikiPaths.proposal(proposalId))
    if (pending) return pending
    return readJSONOrNull(this.adapter, WikiPaths.archivedProposal(proposalId))
  }

  async listPending() {
    let entries
    try {
      entries = await this.adapter.listFolder(WikiPaths.proposalsRoot)
    } catch {
      return []
    }
    const proposals = []
    for (const entry of entries.filter((item) => item.type === 'file' && item.name.endsWith('.json'))) {
      const proposal = await readJSONOrNull(this.adapter, `${WikiPaths.proposalsRoot}/${entry.name}`)
      if (proposal) proposals.push(proposal)
    }
    return proposals.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  }

  async archive(proposalId, status = 'accepted') {
    const proposal = await this.read(proposalId)
    if (!proposal) return null
    await this.adapter.createFolder(WikiPaths.proposalsArchivedRoot)
    await writeJSONWithRevision(this.adapter, WikiPaths.archivedProposal(proposalId), {
      ...proposal,
      archived_at: new Date().toISOString(),
      archive_status: status,
    })
    try { await this.adapter.deleteFile(WikiPaths.proposal(proposalId)) } catch { /* already archived */ }
    return proposal
  }
}
