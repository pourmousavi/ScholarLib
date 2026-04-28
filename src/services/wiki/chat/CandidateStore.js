import { ulid } from 'ulid'
import { WikiPaths } from '../WikiPaths'
import { writeJSONWithRevision } from '../WikiStorage'
import { slugify } from '../PageStore'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function parseDurationDays(value) {
  const match = String(value || '90d').match(/^(\d+)d$/)
  return match ? Number(match[1]) : 90
}

function isExpired(candidate, now = new Date()) {
  const created = new Date(candidate.created_at).getTime()
  if (!Number.isFinite(created)) return false
  return now.getTime() - created > parseDurationDays(candidate.expires_after) * 24 * 60 * 60 * 1000
}

export class CandidateStore {
  constructor(adapter) {
    this.adapter = adapter
  }

  async saveCandidate({ question, answer, provenance = {}, title = null, suggestedConceptPages = [], suggestedPositionThemes = [], expiresAfter = '90d' }) {
    if (!this.adapter) throw new Error('Storage adapter is required to save chat candidates')
    const candidateId = `cand_${ulid()}`
    const record = {
      candidate_id: candidateId,
      created_at: new Date().toISOString(),
      expires_after: expiresAfter,
      question,
      answer,
      provenance,
      title: title || this.titleFromQuestion(question),
      suggested_concept_pages: suggestedConceptPages,
      suggested_position_themes: suggestedPositionThemes,
      clusters_with: [],
      lifecycle: 'candidate',
    }
    const path = WikiPaths.chatCandidate(today(), `${slugify(record.title)}-${candidateId}`)
    await writeJSONWithRevision(this.adapter, path, record)
    return { path, record }
  }

  async archiveExpired(now = new Date()) {
    const candidates = await this.listCandidates()
    const archived = []
    for (const item of candidates) {
      if (!isExpired(item.record, now)) continue
      const date = (item.record.created_at || today()).slice(0, 10)
      const path = WikiPaths.archivedChatCandidate(date, item.path.split('/').pop().replace(/\.json$/, ''))
      await writeJSONWithRevision(this.adapter, path, { ...item.record, lifecycle: 'archived', archived_at: now.toISOString() })
      try { await this.adapter.deleteFile(item.path) } catch { /* best effort */ }
      archived.push(path)
    }
    return archived
  }

  async listCandidates(root = WikiPaths.chatCandidatesRoot) {
    if (!this.adapter) return []
    let rows
    try {
      rows = await this.adapter.listFolder(root)
    } catch {
      return []
    }
    const results = []
    for (const row of rows) {
      const path = `${root}/${row.name}`
      if (row.type === 'folder') {
        results.push(...await this.listCandidates(path))
      } else if (row.name.endsWith('.json')) {
        try { results.push({ path, record: await this.adapter.readJSON(path) }) } catch { /* ignore malformed */ }
      }
    }
    return results
  }

  titleFromQuestion(question) {
    return String(question || 'Chat candidate').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Chat candidate'
  }
}

export { isExpired }
