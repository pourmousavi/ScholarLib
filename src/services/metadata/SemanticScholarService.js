const SS_API = 'https://api.semanticscholar.org/graph/v1/paper'

export const SemanticScholarService = {
  async search(title) {
    const fields = 'title,authors,year,venue,externalIds,abstract,citationCount,fieldsOfStudy'
    const url = `${SS_API}/search?query=${encodeURIComponent(title)}&fields=${fields}&limit=3`

    try {
      const response = await fetch(url)

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      const papers = data.data || []

      if (papers.length === 0) return null

      // Find best match by comparing titles
      const normalizedQuery = this.normalizeTitle(title)
      let bestMatch = papers[0]
      let bestScore = 0

      for (const paper of papers) {
        const score = this.titleSimilarity(normalizedQuery, this.normalizeTitle(paper.title))
        if (score > bestScore) {
          bestScore = score
          bestMatch = paper
        }
      }

      // Only return if similarity is reasonable
      if (bestScore < 0.5) return null

      return this.normalize(bestMatch, bestScore)
    } catch (error) {
      console.error('Semantic Scholar search failed:', error)
      return null
    }
  },

  async lookupByDOI(doi) {
    const url = `${SS_API}/DOI:${encodeURIComponent(doi)}?fields=title,authors,year,venue,externalIds,abstract,fieldsOfStudy`

    try {
      const response = await fetch(url)
      if (!response.ok) return null

      const paper = await response.json()
      return this.normalize(paper, 1.0)
    } catch {
      return null
    }
  },

  normalize(paper, confidence = 0.8) {
    if (!paper) return null

    const authors = (paper.authors || []).map(a => {
      const parts = (a.name || '').split(' ')
      const last = parts.pop() || ''
      const first = parts.join(' ')
      return { last, first, orcid: null }
    })

    // Note: Semantic Scholar's `fieldsOfStudy` are broad discipline
    // classifications (e.g., "Computer Science"), not the paper's keyword
    // section. We only want author-provided keywords from the PDF itself.
    const keywords = []

    return {
      title: paper.title || '',
      authors,
      year: paper.year || null,
      journal: paper.venue || '',
      volume: '',
      issue: '',
      pages: '',
      doi: paper.externalIds?.DOI || '',
      abstract: paper.abstract || '',
      keywords,
      type: 'journal-article',
      url: paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : '',
      extraction_source: 'semantic_scholar',
      extraction_confidence: {
        title: Math.round(confidence * 100),
        authors: Math.round(confidence * 90),
        journal: paper.venue ? Math.round(confidence * 85) : 0,
        doi: paper.externalIds?.DOI ? 100 : 0,
        year: paper.year ? Math.round(confidence * 95) : 0,
        abstract: paper.abstract ? Math.round(confidence * 80) : 0
      },
      citationCount: paper.citationCount || 0
    }
  },

  normalizeTitle(title) {
    return (title || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  },

  titleSimilarity(a, b) {
    if (!a || !b) return 0

    const wordsA = new Set(a.split(' '))
    const wordsB = new Set(b.split(' '))

    let matches = 0
    for (const word of wordsA) {
      if (wordsB.has(word)) matches++
    }

    return matches / Math.max(wordsA.size, wordsB.size)
  }
}
