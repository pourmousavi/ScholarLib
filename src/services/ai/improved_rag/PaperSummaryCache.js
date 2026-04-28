import { WikiPaths } from '../../wiki/WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from '../../wiki/WikiStorage'

function summaryPath(docId) {
  return `${WikiPaths.systemRoot}/rag-summary-cache/${String(docId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-')}.json`
}

export class PaperSummaryCache {
  constructor({ aiService = null } = {}) {
    this.aiService = aiService
  }

  async getOrCreate(adapter, doc, chunks = []) {
    if (!adapter || !doc?.id) return null
    const existing = await readJSONOrNull(adapter, summaryPath(doc.id))
    if (existing?.summary) return { ...existing, cache_hit: true }

    const source = chunks.map(chunk => chunk.text).join('\n\n').slice(0, 6000)
    const summary = await this.summarize(doc, source)
    const record = {
      doc_id: doc.id,
      title: doc.metadata?.title || doc.filename || doc.id,
      summary,
      created_at: new Date().toISOString(),
      source_chunk_count: chunks.length,
    }
    await writeJSONWithRevision(adapter, summaryPath(doc.id), record)
    return { ...record, cache_hit: false }
  }

  async summarize(doc, text) {
    if (typeof this.aiService?.chat === 'function' && text) {
      try {
        return await this.aiService.chat([
          { role: 'system', content: 'Summarise this paper in 200-400 words for retrieval context.' },
          { role: 'user', content: text },
        ])
      } catch {
        // fall through to deterministic local summary
      }
    }
    const title = doc.metadata?.title || doc.filename || doc.id
    return `${title}: ${String(text || '').replace(/\s+/g, ' ').slice(0, 1200)}`
  }
}
