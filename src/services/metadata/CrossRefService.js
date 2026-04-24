const CROSSREF_API = 'https://api.crossref.org/works'

export const CrossRefService = {
  async lookup(doi) {
    const url = `${CROSSREF_API}/${encodeURIComponent(doi)}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ScholarLib/1.0 (mailto:ali.pourmousavi@adelaide.edu.au)'
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      throw new Error(`CrossRef lookup failed: ${response.status}`)
    }

    const data = await response.json()
    return this.normalizeWork(data.message)
  },

  async searchByTitle(title) {
    const url = `${CROSSREF_API}?query.title=${encodeURIComponent(title)}&rows=3`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ScholarLib/1.0 (mailto:ali.pourmousavi@adelaide.edu.au)'
      }
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const items = data.message?.items || []

    if (items.length === 0) return null

    // Return best match
    return this.normalizeWork(items[0])
  },

  normalizeWork(work) {
    if (!work) return null

    const authors = (work.author || []).map(a => ({
      last: a.family || '',
      first: a.given || '',
      orcid: a.ORCID || null
    }))

    const year = work['published-print']?.['date-parts']?.[0]?.[0] ||
                 work['published-online']?.['date-parts']?.[0]?.[0] ||
                 work.issued?.['date-parts']?.[0]?.[0] ||
                 null

    // Note: CrossRef's `subject` field is journal-level classification
    // (e.g., "General Engineering"), not the paper's own keyword section.
    // We only want author-provided keywords — sourced from the PDF itself.
    const keywords = []

    return {
      title: work.title?.[0] || '',
      authors,
      year,
      journal: work['container-title']?.[0] || '',
      volume: work.volume || '',
      issue: work.issue || '',
      pages: work.page || '',
      doi: work.DOI || '',
      abstract: work.abstract ? this.stripHtml(work.abstract) : '',
      keywords,
      type: work.type || 'journal-article',
      url: work.URL || (work.DOI ? `https://doi.org/${work.DOI}` : ''),
      extraction_source: 'crossref',
      extraction_confidence: {
        title: 99,
        authors: 97,
        journal: 99,
        doi: 100,
        year: 99,
        abstract: work.abstract ? 85 : 0
      }
    }
  },

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim()
  }
}
