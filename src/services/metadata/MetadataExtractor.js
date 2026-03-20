import { CrossRefService } from './CrossRefService'
import { SemanticScholarService } from './SemanticScholarService'
import { AIExtractor } from './AIExtractor'

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

    // Extract possible title early for validation
    const possibleTitle = this.extractPossibleTitle(firstPages, filename)

    // Step 1: Try DOI lookup via CrossRef
    const doi = this.detectDOI(firstPages)
    if (doi) {
      console.log('Found DOI:', doi)
      const crossrefResult = await CrossRefService.lookup(doi)
      if (crossrefResult) {
        // Validate: does the CrossRef title match our extracted title?
        if (this.titlesMatch(crossrefResult.title, possibleTitle)) {
          console.log('CrossRef DOI match validated')
          return crossrefResult
        } else {
          console.log('CrossRef DOI result title mismatch, skipping:', crossrefResult.title, 'vs', possibleTitle)
        }
      }
    }

    // Step 2: Try to extract title and search
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
    // Strategy: Look for the paper's own DOI, not reference DOIs
    // Paper DOIs typically appear:
    // 1. Very early in document (header/first page metadata)
    // 2. With explicit "DOI:" label
    // 3. As doi.org URLs

    const headerText = text.slice(0, 3000) // Focus on first ~3 pages

    // Priority 1: Look for explicit DOI: label in header area
    const explicitDOIPatterns = [
      /\bDOI[:\s]+\s*(10\.\d{4,}\/[^\s\])}>,]+)/i,
      /\bdoi\.org\/(10\.\d{4,}\/[^\s\])}>,]+)/i,
      /https?:\/\/doi\.org\/(10\.\d{4,}\/[^\s\])}>,]+)/i,
    ]

    for (const pattern of explicitDOIPatterns) {
      const match = headerText.match(pattern)
      if (match) {
        const doi = this.cleanDOI(match[1])
        if (doi) {
          console.log('Found explicit DOI in header:', doi)
          return doi
        }
      }
    }

    // Priority 2: Look for standalone DOI in very first part (title/abstract area)
    // Skip if it appears to be in a reference context (after [1], [2], etc.)
    const veryEarlyText = text.slice(0, 1500)
    const standaloneMatch = veryEarlyText.match(/\b(10\.\d{4,}\/[^\s\])}>,]+)/i)
    if (standaloneMatch) {
      // Check it's not in a reference context
      const matchIndex = standaloneMatch.index
      const contextBefore = veryEarlyText.slice(Math.max(0, matchIndex - 50), matchIndex)

      // Skip if preceded by reference markers like [1], [2], (2023), etc.
      if (!/\[\d+\]|\(\d{4}\)|References|Bibliography/i.test(contextBefore)) {
        const doi = this.cleanDOI(standaloneMatch[1])
        if (doi) {
          console.log('Found DOI in early text:', doi)
          return doi
        }
      }
    }

    // Priority 3: Broader search but still avoid reference section
    // Look for DOI that's NOT in a references-like context
    const allDOIs = []
    const doiRegex = /\b(10\.\d{4,}\/[^\s\])}>,]+)/gi
    let match

    while ((match = doiRegex.exec(headerText)) !== null) {
      const doi = this.cleanDOI(match[1])
      if (doi) {
        const contextBefore = headerText.slice(Math.max(0, match.index - 100), match.index)
        const isReference = /\[\d+\]|\(\d{4}\)|References|Bibliography|et al\./i.test(contextBefore)
        allDOIs.push({ doi, index: match.index, isReference })
      }
    }

    // Return first non-reference DOI, or first DOI if all appear to be references
    const nonRefDOI = allDOIs.find(d => !d.isReference)
    if (nonRefDOI) {
      console.log('Found non-reference DOI:', nonRefDOI.doi)
      return nonRefDOI.doi
    }

    if (allDOIs.length > 0) {
      console.log('Only reference DOIs found, using first:', allDOIs[0].doi)
      return allDOIs[0].doi
    }

    return null
  },

  cleanDOI(doi) {
    if (!doi) return null
    // Remove trailing punctuation and whitespace
    doi = doi.replace(/[.,;:)\]}>'"]+$/, '').trim()
    // Validate it looks like a DOI
    if (doi.startsWith('10.') && doi.length > 7) {
      return doi
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

  titlesMatch(title1, title2) {
    // Check if two titles are similar enough to be the same paper
    if (!title1 || !title2) return false

    const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
    const t1 = normalize(title1)
    const t2 = normalize(title2)

    // Get significant words (4+ chars)
    const words1 = new Set(t1.split(' ').filter(w => w.length >= 4))
    const words2 = t2.split(' ').filter(w => w.length >= 4)

    if (words1.size === 0 || words2.length === 0) return true // Can't compare, assume match

    // Count overlapping words
    let matches = 0
    for (const word of words2) {
      if (words1.has(word)) matches++
    }

    // Require at least 30% word overlap
    const overlapRatio = matches / Math.max(words1.size, words2.length)
    console.log(`Title match: ${matches}/${Math.max(words1.size, words2.length)} words = ${(overlapRatio * 100).toFixed(0)}%`)
    return overlapRatio >= 0.3
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
