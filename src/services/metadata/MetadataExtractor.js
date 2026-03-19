import { CrossRefService } from './CrossRefService'
import { SemanticScholarService } from './SemanticScholarService'
import { AIExtractor } from './AIExtractor'

// DOI patterns
const DOI_PATTERNS = [
  /\b(10\.\d{4,}\/[^\s]+)/i,
  /doi[:\s]*([^\s]+)/i,
  /https?:\/\/doi\.org\/(10\.\d{4,}\/[^\s]+)/i,
]

export const MetadataExtractor = {
  /**
   * Extract metadata from PDF text using a cascading pipeline:
   * 1. Try to find DOI and lookup in CrossRef
   * 2. Try Semantic Scholar search by title
   * 3. Fall back to AI extraction (if available)
   * 4. Return manual entry template
   */
  async extractMetadata(pdfText, filename, aiService = null) {
    const firstPages = pdfText.slice(0, 10000) // First ~10 pages worth of text

    // Step 1: Try DOI lookup via CrossRef
    const doi = this.detectDOI(firstPages)
    if (doi) {
      console.log('Found DOI:', doi)
      const crossrefResult = await CrossRefService.lookup(doi)
      if (crossrefResult) {
        console.log('CrossRef match found')
        return crossrefResult
      }
    }

    // Step 2: Try to extract title and search
    const possibleTitle = this.extractPossibleTitle(firstPages, filename)
    console.log('Searching by title:', possibleTitle)

    // Try CrossRef title search
    const crossrefTitleResult = await CrossRefService.searchByTitle(possibleTitle)
    if (crossrefTitleResult && this.isGoodMatch(crossrefTitleResult, possibleTitle)) {
      console.log('CrossRef title search match')
      return crossrefTitleResult
    }

    // Try Semantic Scholar
    const ssResult = await SemanticScholarService.search(possibleTitle)
    if (ssResult) {
      console.log('Semantic Scholar match found')
      return ssResult
    }

    // Step 3: Try AI extraction
    if (aiService) {
      console.log('Attempting AI extraction')
      const aiResult = await AIExtractor.extract(firstPages, aiService)
      if (aiResult && aiResult.title) {
        return aiResult
      }
    }

    // Step 4: Return empty template for manual entry
    console.log('No metadata found, returning manual template')
    return this.createManualTemplate(filename, possibleTitle)
  },

  detectDOI(text) {
    for (const pattern of DOI_PATTERNS) {
      const match = text.match(pattern)
      if (match) {
        let doi = match[1]
        // Clean up DOI
        doi = doi.replace(/[.,;:)\]}>'"]+$/, '') // Remove trailing punctuation
        if (doi.startsWith('10.')) {
          return doi
        }
      }
    }
    return null
  },

  extractPossibleTitle(text, filename) {
    // Try to find title from first few lines
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 10 && l.length < 300)
      .slice(0, 20)

    // Look for a line that looks like a title (longer, possibly capitalized)
    for (const line of lines) {
      // Skip lines that look like headers/footers
      if (/^\d+$/.test(line)) continue
      if (/^(abstract|introduction|keywords|doi|copyright)/i.test(line)) continue
      if (line.includes('@')) continue // Email

      // Good title candidate
      if (line.length > 30 && line.length < 250) {
        // Check if it's mostly alphabetic
        const alphaRatio = (line.match(/[a-zA-Z]/g) || []).length / line.length
        if (alphaRatio > 0.7) {
          return line
        }
      }
    }

    // Fall back to filename
    return filename
      .replace(/\.pdf$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  },

  isGoodMatch(result, searchTitle) {
    if (!result || !result.title) return false

    const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').trim()
    const resultTitle = normalize(result.title)
    const queryTitle = normalize(searchTitle)

    // Check word overlap
    const resultWords = new Set(resultTitle.split(/\s+/))
    const queryWords = queryTitle.split(/\s+/)

    let matches = 0
    for (const word of queryWords) {
      if (word.length > 3 && resultWords.has(word)) {
        matches++
      }
    }

    return matches >= Math.min(3, queryWords.length * 0.5)
  },

  createManualTemplate(filename, possibleTitle) {
    return {
      title: possibleTitle || '',
      authors: [],
      year: new Date().getFullYear(),
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
      }
    }
  },

  /**
   * Calculate overall confidence score
   */
  getOverallConfidence(metadata) {
    const weights = {
      title: 0.25,
      authors: 0.20,
      year: 0.15,
      journal: 0.15,
      doi: 0.15,
      abstract: 0.10
    }

    const conf = metadata.extraction_confidence || {}
    let total = 0
    let weightSum = 0

    for (const [field, weight] of Object.entries(weights)) {
      if (conf[field] !== undefined) {
        total += conf[field] * weight
        weightSum += weight
      }
    }

    return weightSum > 0 ? Math.round(total / weightSum) : 0
  }
}
