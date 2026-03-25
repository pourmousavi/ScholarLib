/**
 * OpenAlexService - Academic metadata enrichment
 *
 * OpenAlex is a free, open index of scholarly works providing:
 * - Citation counts
 * - Open access URLs
 * - ORCID identifiers
 * - Related works
 *
 * API: https://api.openalex.org/works
 * Docs: https://docs.openalex.org/
 *
 * No API key required. Adding email in User-Agent header gets polite pool (faster responses).
 */

const BASE_URL = 'https://api.openalex.org'
const TIMEOUT_MS = 10000

export const OpenAlexService = {
  /**
   * Lookup work by DOI
   * @param {string} doi - DOI without https://doi.org/ prefix
   * @param {string} email - Optional email for polite pool access
   * @returns {Promise<object|null>} OpenAlex work data or null
   */
  async lookupByDOI(doi, email = '') {
    if (!doi) return null

    // Clean DOI
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//, '').trim()
    const url = `${BASE_URL}/works/https://doi.org/${encodeURIComponent(cleanDoi)}`

    console.log('OpenAlex: Looking up DOI:', cleanDoi)

    try {
      const response = await this.fetch(url, email)
      if (!response) return null

      return this.normalize(response)
    } catch (error) {
      console.warn('OpenAlex DOI lookup failed:', error.message)
      return null
    }
  },

  /**
   * Search for work by title
   * @param {string} title - Paper title to search
   * @param {string} email - Optional email for polite pool access
   * @returns {Promise<object|null>} Best matching work or null
   */
  async searchByTitle(title, email = '') {
    if (!title || title.length < 10) return null

    // Clean title for search
    const cleanTitle = title
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)

    const url = `${BASE_URL}/works?filter=title.search:${encodeURIComponent(cleanTitle)}&per_page=5`

    console.log('OpenAlex: Searching for title:', cleanTitle.slice(0, 50))

    try {
      const response = await this.fetch(url, email)
      if (!response || !response.results || response.results.length === 0) {
        return null
      }

      // Find best match by comparing titles
      const results = response.results
      let bestMatch = null
      let bestScore = 0

      for (const work of results) {
        const score = this.titleSimilarity(title, work.title)
        if (score > bestScore && score > 0.5) {
          bestScore = score
          bestMatch = work
        }
      }

      if (bestMatch) {
        console.log('OpenAlex: Found match with score:', bestScore.toFixed(2))
        return this.normalize(bestMatch)
      }

      return null
    } catch (error) {
      console.warn('OpenAlex title search failed:', error.message)
      return null
    }
  },

  /**
   * Enrich existing metadata with OpenAlex data
   * @param {object} metadata - Existing metadata object
   * @param {string} email - Optional email for polite pool access
   * @returns {Promise<object>} Enriched metadata
   */
  async enrich(metadata, email = '') {
    if (!metadata) return metadata

    let openAlexData = null

    // Try DOI lookup first (most accurate)
    if (metadata.doi) {
      openAlexData = await this.lookupByDOI(metadata.doi, email)
    }

    // Fall back to title search
    if (!openAlexData && metadata.title) {
      openAlexData = await this.searchByTitle(metadata.title, email)
    }

    if (!openAlexData) {
      return metadata
    }

    // Merge OpenAlex data into metadata
    const enriched = { ...metadata }

    // Add citation count (new field)
    if (openAlexData.citation_count !== undefined) {
      enriched.citation_count = openAlexData.citation_count
    }

    // Add open access URL if available and we don't have one
    if (openAlexData.open_access_url && !enriched.open_access_url) {
      enriched.open_access_url = openAlexData.open_access_url
    }

    // Add ORCID IDs to authors if missing
    if (openAlexData.authors && openAlexData.authors.length > 0 && enriched.authors) {
      enriched.authors = enriched.authors.map((author, idx) => {
        if (!author.orcid && openAlexData.authors[idx]?.orcid) {
          return { ...author, orcid: openAlexData.authors[idx].orcid }
        }
        return author
      })
    }

    // Fill in missing fields
    if (!enriched.abstract && openAlexData.abstract) {
      enriched.abstract = openAlexData.abstract
      enriched.extraction_confidence = {
        ...enriched.extraction_confidence,
        abstract: 85
      }
    }

    if (!enriched.year && openAlexData.year) {
      enriched.year = openAlexData.year
    }

    if (!enriched.doi && openAlexData.doi) {
      enriched.doi = openAlexData.doi
      enriched.url = `https://doi.org/${openAlexData.doi}`
    }

    // Merge keywords from OpenAlex concepts
    if (openAlexData.keywords && openAlexData.keywords.length > 0) {
      const existingKeywords = new Set((enriched.keywords || []).map(k => k.toLowerCase()))
      const newKeywords = openAlexData.keywords.filter(k => !existingKeywords.has(k.toLowerCase()))
      enriched.keywords = [...(enriched.keywords || []), ...newKeywords].slice(0, 15)
    }

    // Update extraction source
    const currentSource = enriched.extraction_source || 'unknown'
    enriched.extraction_source = currentSource.includes('openalex')
      ? currentSource
      : `${currentSource}+openalex`

    console.log('OpenAlex: Enriched metadata with citation_count:', openAlexData.citation_count)

    return enriched
  },

  /**
   * Make API request with proper headers and timeout
   */
  async fetch(url, email = '') {
    const headers = {
      'Accept': 'application/json'
    }

    // Add email for polite pool (faster responses)
    if (email) {
      headers['User-Agent'] = `ScholarLib/1.0 (mailto:${email})`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('OpenAlex: Rate limited')
        }
        return null
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        console.warn('OpenAlex: Request timed out')
      }
      throw error
    }
  },

  /**
   * Normalize OpenAlex work response to our metadata format
   */
  normalize(work) {
    // Extract DOI from work ID or doi field
    let doi = ''
    if (work.doi) {
      doi = work.doi.replace('https://doi.org/', '')
    } else if (work.ids?.doi) {
      doi = work.ids.doi.replace('https://doi.org/', '')
    }

    // Extract authors with ORCID
    const authors = (work.authorships || []).map(authorship => {
      const author = authorship.author || {}
      const nameParts = (author.display_name || '').split(' ')
      const lastName = nameParts.pop() || ''
      const firstName = nameParts.join(' ')

      let orcid = null
      if (author.orcid) {
        orcid = author.orcid.replace('https://orcid.org/', '')
      }

      return {
        last: lastName,
        first: firstName,
        orcid,
        affiliation: authorship.institutions?.[0]?.display_name || null
      }
    })

    // Extract year from publication_date
    let year = null
    if (work.publication_year) {
      year = work.publication_year
    } else if (work.publication_date) {
      year = parseInt(work.publication_date.slice(0, 4), 10)
    }

    // Extract journal/venue info
    let journal = ''
    let volume = ''
    let issue = ''
    let pages = ''

    if (work.primary_location?.source) {
      journal = work.primary_location.source.display_name || ''
    } else if (work.host_venue) {
      journal = work.host_venue.display_name || ''
    }

    if (work.biblio) {
      volume = work.biblio.volume || ''
      issue = work.biblio.issue || ''
      if (work.biblio.first_page) {
        pages = work.biblio.last_page
          ? `${work.biblio.first_page}-${work.biblio.last_page}`
          : work.biblio.first_page
      }
    }

    // Extract open access URL
    let openAccessUrl = null
    if (work.open_access?.oa_url) {
      openAccessUrl = work.open_access.oa_url
    } else if (work.primary_location?.pdf_url) {
      openAccessUrl = work.primary_location.pdf_url
    }

    // Extract abstract (OpenAlex stores inverted index, reconstruct if needed)
    let abstract = ''
    if (work.abstract) {
      abstract = work.abstract
    } else if (work.abstract_inverted_index) {
      abstract = this.reconstructAbstract(work.abstract_inverted_index)
    }

    // Extract keywords/concepts
    const keywords = (work.concepts || [])
      .filter(c => c.score > 0.3)
      .slice(0, 10)
      .map(c => c.display_name)

    return {
      title: work.title || work.display_name || '',
      authors,
      year,
      journal,
      volume,
      issue,
      pages,
      doi,
      abstract,
      keywords,
      type: this.mapWorkType(work.type),
      url: doi ? `https://doi.org/${doi}` : (work.landing_page_url || ''),
      citation_count: work.cited_by_count || 0,
      open_access_url: openAccessUrl,
      openalex_id: work.id,
      extraction_source: 'openalex',
      extraction_confidence: {
        title: work.title ? 95 : 0,
        authors: authors.length > 0 ? 90 : 0,
        journal: journal ? 88 : 0,
        doi: doi ? 98 : 0,
        year: year ? 95 : 0,
        abstract: abstract ? 85 : 0
      }
    }
  },

  /**
   * Reconstruct abstract from OpenAlex inverted index format
   */
  reconstructAbstract(invertedIndex) {
    if (!invertedIndex || typeof invertedIndex !== 'object') {
      return ''
    }

    // invertedIndex is { word: [position1, position2, ...] }
    const wordPositions = []
    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions) {
        wordPositions.push({ word, pos })
      }
    }

    // Sort by position and join
    wordPositions.sort((a, b) => a.pos - b.pos)
    return wordPositions.map(wp => wp.word).join(' ')
  },

  /**
   * Map OpenAlex work type to our type
   */
  mapWorkType(oaType) {
    const typeMap = {
      'journal-article': 'journal-article',
      'article': 'journal-article',
      'book-chapter': 'book-chapter',
      'book': 'book',
      'proceedings-article': 'conference-paper',
      'conference-paper': 'conference-paper',
      'dissertation': 'thesis',
      'thesis': 'thesis',
      'preprint': 'preprint',
      'report': 'report',
      'dataset': 'dataset'
    }
    return typeMap[oaType] || 'journal-article'
  },

  /**
   * Calculate title similarity score (0-1)
   */
  titleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0

    const normalize = (s) => s.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    const t1 = normalize(title1)
    const t2 = normalize(title2)

    // Exact match
    if (t1 === t2) return 1.0

    // Word overlap
    const words1 = new Set(t1.split(' ').filter(w => w.length > 3))
    const words2 = new Set(t2.split(' ').filter(w => w.length > 3))

    if (words1.size === 0 || words2.size === 0) return 0

    let overlap = 0
    for (const w of words1) {
      if (words2.has(w)) overlap++
    }

    return overlap / Math.max(words1.size, words2.size)
  },

  /**
   * Check if OpenAlex API is available
   */
  async isAvailable() {
    try {
      const response = await fetch(`${BASE_URL}/works?per_page=1`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch {
      return false
    }
  }
}
