/**
 * AI-based metadata extraction
 * Used as fallback when CrossRef and Semantic Scholar don't find a match
 * Requires AI service to be configured (Stage 09+)
 */

const EXTRACTION_PROMPT = `Extract bibliographic metadata from this academic paper excerpt.
Return ONLY a valid JSON object with these fields (no markdown, no explanation):
{
  "title": "full paper title",
  "authors": [{"last": "surname", "first": "given name or initials"}],
  "year": 2024,
  "journal": "journal or conference name",
  "volume": "volume number or empty string",
  "pages": "page range or empty string",
  "doi": "DOI if found or empty string",
  "abstract": "2-3 sentence summary of the paper",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

Paper text:
`

export const AIExtractor = {
  async extract(firstPagesText, aiService) {
    if (!aiService) {
      return this.createEmptyResult('AI service not available')
    }

    try {
      const prompt = EXTRACTION_PROMPT + firstPagesText.slice(0, 4000)

      const response = await aiService.chat([
        { role: 'user', content: prompt }
      ])

      const parsed = this.parseJSON(response)
      if (!parsed) {
        return this.createEmptyResult('Failed to parse AI response')
      }

      return this.normalize(parsed)
    } catch (error) {
      console.error('AI extraction failed:', error)
      return this.createEmptyResult(error.message)
    }
  },

  parseJSON(text) {
    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      return null
    }
  },

  normalize(data) {
    const authors = (data.authors || []).map(a => ({
      last: a.last || '',
      first: a.first || '',
      orcid: null
    }))

    return {
      title: data.title || '',
      authors,
      year: data.year || null,
      journal: data.journal || '',
      volume: data.volume || '',
      issue: '',
      pages: data.pages || '',
      doi: data.doi || '',
      abstract: data.abstract || '',
      keywords: data.keywords || [],
      type: 'journal-article',
      url: data.doi ? `https://doi.org/${data.doi}` : '',
      extraction_source: 'ai',
      extraction_confidence: {
        title: 75,
        authors: 70,
        journal: 65,
        doi: data.doi ? 80 : 0,
        year: data.year ? 75 : 0,
        abstract: 70
      }
    }
  },

  createEmptyResult(error) {
    return {
      title: '',
      authors: [],
      year: null,
      journal: '',
      volume: '',
      issue: '',
      pages: '',
      doi: '',
      abstract: '',
      keywords: [],
      type: 'journal-article',
      url: '',
      extraction_source: 'manual',
      extraction_confidence: {
        title: 0,
        authors: 0,
        journal: 0,
        doi: 0,
        year: 0,
        abstract: 0
      },
      extraction_error: error
    }
  }
}
