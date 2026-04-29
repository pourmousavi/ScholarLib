function extractCandidatesFromBody(page) {
  const text = String(page.body || '')
  const candidates = []
  const pattern = /```scholarlib-question-candidate\n([\s\S]*?)```/g
  let match
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1]
    const id = raw.match(/^id:\s*(.+)$/m)?.[1]?.trim()
    const question = raw.match(/^candidate_question:\s*(.+)$/m)?.[1]?.trim()
    if (question) {
      candidates.push({
        id: id || `${page.id}:${candidates.length}`,
        source_page: page.id,
        candidate_question: question,
        raw,
      })
    }
  }
  return candidates
}

function tokens(text) {
  return new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 3))
}

function similarity(a, b) {
  const left = tokens(a)
  const right = tokens(b)
  if (left.size === 0 || right.size === 0) return 0
  const overlap = [...left].filter(token => right.has(token)).length
  return overlap / Math.max(left.size, right.size)
}

export class QuestionClusterer {
  collectCandidates(pages) {
    return pages.flatMap(extractCandidatesFromBody)
  }

  cluster(candidates, { threshold = 0.35 } = {}) {
    const clusters = []
    for (const candidate of candidates) {
      const existing = clusters.find(cluster => similarity(cluster.label, candidate.candidate_question) >= threshold)
      if (existing) {
        existing.candidates.push(candidate)
      } else {
        clusters.push({
          id: `cluster_${clusters.length + 1}`,
          label: candidate.candidate_question,
          candidates: [candidate],
          status: 'review',
        })
      }
    }
    return clusters
  }
}

export { extractCandidatesFromBody, similarity }
