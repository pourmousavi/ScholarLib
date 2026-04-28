function tokens(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2)
}

function lexicalOverlap(query, text) {
  const queryTokens = new Set(tokens(query))
  if (queryTokens.size === 0) return 0
  const textTokens = tokens(text)
  const hits = textTokens.filter(token => queryTokens.has(token)).length
  return hits / queryTokens.size
}

export class Reranker {
  async rerank(query, chunks, { topK = chunks.length } = {}) {
    return chunks
      .map((chunk, index) => ({
        ...chunk,
        original_rank: chunk.original_rank ?? index,
        rerank_score: lexicalOverlap(query, `${chunk.docTitle || ''} ${chunk.text || ''}`),
      }))
      .sort((a, b) => (b.rerank_score - a.rerank_score) || ((b.score || 0) - (a.score || 0)))
      .slice(0, topK)
  }
}
