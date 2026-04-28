import { indexService as defaultIndexService } from '../../indexing/IndexService'
import { useLibraryStore } from '../../../store/libraryStore'
import { QueryRewriter } from './QueryRewriter'
import { Reranker } from './Reranker'
import { PaperSummaryCache } from './PaperSummaryCache'

function dedupeKey(chunk) {
  return `${chunk.doc_id}:${chunk.chunk_index ?? chunk.chunk_id ?? chunk.text_preview ?? chunk.text}`
}

function bm25Proxy(query, chunk) {
  const terms = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const text = String(chunk.text || '').toLowerCase()
  if (terms.length === 0) return 0
  return terms.filter(term => text.includes(term)).length / terms.length
}

export class HybridRetrieval {
  constructor({
    indexService = defaultIndexService,
    queryRewriter = new QueryRewriter(),
    reranker = new Reranker(),
    summaryCache = new PaperSummaryCache(),
  } = {}) {
    this.indexService = indexService
    this.queryRewriter = queryRewriter
    this.reranker = reranker
    this.summaryCache = summaryCache
  }

  async retrieve(query, scope, options = {}) {
    const { adapter, provider, topK = provider === 'webllm' ? 3 : 6 } = options
    if (!adapter) return { chunks: [], summaries: [], queries: [query], retrieval_method: 'improved_rag' }

    const queries = await this.queryRewriter.rewrite(query, options.history || [])
    const searchScope = {
      ...scope,
      docId: options.selectedDocId ?? scope?.docId,
      folderId: options.selectedFolderId ?? scope?.folderId,
    }
    const merged = new Map()
    for (const rewritten of queries) {
      const chunks = await this.indexService.search(rewritten, searchScope, adapter, Math.max(topK * 2, 8))
      chunks.forEach((chunk, index) => {
        const key = dedupeKey(chunk)
        const hybridScore = ((chunk.score || 0) * 0.6) + (bm25Proxy(query, chunk) * 0.4)
        const existing = merged.get(key)
        if (!existing || hybridScore > existing.hybrid_score) {
          merged.set(key, { ...chunk, original_rank: index, hybrid_score: hybridScore, rewritten_query: rewritten })
        }
      })
    }

    const reranked = await this.reranker.rerank(query, [...merged.values()], { topK })
    const summaries = await this.summariesFor(adapter, reranked)
    return {
      chunks: reranked,
      summaries,
      queries,
      retrieval_method: 'improved_rag',
    }
  }

  async summariesFor(adapter, chunks) {
    const documents = useLibraryStore.getState().documents
    const ids = [...new Set(chunks.map(chunk => chunk.doc_id).filter(Boolean))]
    const summaries = []
    for (const id of ids.slice(0, 3)) {
      const docChunks = chunks.filter(chunk => chunk.doc_id === id)
      const summary = await this.summaryCache.getOrCreate(adapter, documents[id] || { id }, docChunks)
      if (summary) summaries.push(summary)
    }
    return summaries
  }
}
