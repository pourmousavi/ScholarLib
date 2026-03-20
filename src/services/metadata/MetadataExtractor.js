import { CrossRefService } from './CrossRefService'
import { SemanticScholarService } from './SemanticScholarService'
import { AIExtractor } from './AIExtractor'
import { GROBIDService } from './GROBIDService'
import { OpenAlexService } from './OpenAlexService'

export const MetadataExtractor = {
  /**
   * Extract metadata from PDF using a cascading pipeline:
   * 1. Try to find DOI and lookup in CrossRef
   * 2. Try GROBID ML extraction (90%+ accuracy) - NEW PRIMARY METHOD
   * 3. Fall back to AI extraction (improved prompts)
   * 4. Try title-based CrossRef/Semantic Scholar search
   * 5. Enrich with OpenAlex (citations, OA links)
   * 6. Return manual entry template
   *
   * @param {string} pdfText - Extracted text from PDF
   * @param {string} filename - Original filename
   * @param {object} aiService - AI service instance (optional)
   * @param {ArrayBuffer} pdfBuffer - Raw PDF bytes for GROBID (optional)
   * @param {object} settings - User settings for metadata sources (optional)
   */
  async extractMetadata(pdfText, filename, aiService = null, pdfBuffer = null, settings = null) {
    const firstPages = pdfText.slice(0, 10000) // First ~10 pages worth of text
    const errors = [] // Collect errors for debugging

    // Get user preferences for metadata sources
    const sources = settings?.global?.metadata_sources || {
      grobid: true,
      openalex: true,
      crossref: true,
      semantic_scholar: true,
      ai: true
    }
    const grobidEndpoint = settings?.global?.grobid_endpoint || 'huggingface'
    const crossrefEmail = settings?.global?.crossref_email || ''

    // Debug: Log extraction parameters and first 500 chars
    console.log('PDF text preview (first 500 chars):', firstPages.slice(0, 500))
    console.log('MetadataExtractor params:', {
      hasPdfBuffer: !!pdfBuffer,
      pdfBufferType: pdfBuffer?.constructor?.name,
      pdfBufferSize: pdfBuffer?.byteLength,
      hasSettings: !!settings,
      sources,
      grobidEndpoint
    })

    // Extract possible title early for validation
    const possibleTitle = this.extractPossibleTitle(firstPages, filename)
    console.log('Extracted possible title:', possibleTitle)

    // Step 1: Try DOI lookup via CrossRef
    let doi = this.detectDOI(firstPages)

    // If no DOI in text, try to extract from ScienceDirect filename
    if (!doi) {
      doi = this.extractDOIFromFilename(filename)
    }

    if (doi && sources.crossref) {
      console.log('Found DOI:', doi)
      try {
        const crossrefResult = await CrossRefService.lookup(doi)
        if (crossrefResult) {
          // Validate: does the CrossRef title match our extracted title?
          if (this.titlesMatch(crossrefResult.title, possibleTitle)) {
            console.log('CrossRef DOI match validated')
            // Enrich with OpenAlex if enabled
            if (sources.openalex) {
              return await OpenAlexService.enrich(crossrefResult, crossrefEmail)
            }
            return crossrefResult
          } else {
            console.log('CrossRef DOI result title mismatch, skipping:', crossrefResult.title, 'vs', possibleTitle)
          }
        }
      } catch (err) {
        console.warn('CrossRef DOI lookup failed:', err.message)
        errors.push({ source: 'crossref', error: err.message })
      }
    } else {
      console.log('No DOI found in PDF text or filename')
    }

    // Step 2: Try GROBID ML extraction (PRIMARY method when no DOI)
    console.log('GROBID check:', { hasPdfBuffer: !!pdfBuffer, grobidEnabled: sources.grobid })
    if (pdfBuffer && sources.grobid) {
      console.log('Attempting GROBID extraction (ML-based, 90%+ accuracy)')
      try {
        const grobidResult = await GROBIDService.extractWithFallback(pdfBuffer, grobidEndpoint)

        if (grobidResult && grobidResult.title && grobidResult.title.length > 10) {
          console.log('GROBID extraction successful:', grobidResult.title)

          // If GROBID found a DOI, validate with CrossRef
          if (grobidResult.doi && sources.crossref) {
            try {
              const crossrefResult = await CrossRefService.lookup(grobidResult.doi)
              if (crossrefResult && this.titlesMatch(crossrefResult.title, grobidResult.title)) {
                console.log('GROBID DOI validated with CrossRef')
                const merged = this.mergeMetadata(grobidResult, crossrefResult, 'grobid+crossref')
                if (sources.openalex) {
                  return await OpenAlexService.enrich(merged, crossrefEmail)
                }
                return merged
              }
            } catch (err) {
              console.warn('CrossRef validation of GROBID DOI failed:', err.message)
            }
          }

          // Try to find DOI via CrossRef title search
          if (!grobidResult.doi && sources.crossref) {
            try {
              const crossrefResult = await CrossRefService.searchByTitle(grobidResult.title)
              if (crossrefResult && this.titlesMatch(crossrefResult.title, grobidResult.title)) {
                console.log('Found matching DOI via CrossRef title search:', crossrefResult.doi)
                const merged = this.mergeMetadata(grobidResult, crossrefResult, 'grobid+crossref')
                if (sources.openalex) {
                  return await OpenAlexService.enrich(merged, crossrefEmail)
                }
                return merged
              }
            } catch (err) {
              console.warn('CrossRef title search failed:', err.message)
            }
          }

          // Enrich GROBID result with OpenAlex
          if (sources.openalex) {
            return await OpenAlexService.enrich(grobidResult, crossrefEmail)
          }
          return grobidResult
        } else {
          console.log('GROBID extraction returned empty or invalid result')
        }
      } catch (err) {
        console.warn('GROBID extraction failed:', err.message)
        errors.push({ source: 'grobid', error: err.message })
      }
    }

    // Step 3: Fall back to AI extraction
    if (aiService && sources.ai) {
      console.log('Attempting AI extraction (fallback method)')
      try {
        const aiResult = await AIExtractor.extract(firstPages, aiService)
        if (aiResult && aiResult.title && aiResult.title.length > 10) {
          console.log('AI extraction successful:', aiResult.title)

          // Try to find DOI via CrossRef using AI-extracted title
          if (!aiResult.doi && sources.crossref) {
            try {
              const crossrefResult = await CrossRefService.searchByTitle(aiResult.title)
              if (crossrefResult && this.titlesMatch(crossrefResult.title, aiResult.title)) {
                console.log('Found matching DOI via CrossRef:', crossrefResult.doi)
                const merged = this.mergeMetadata(aiResult, crossrefResult, 'ai+crossref')
                if (sources.openalex) {
                  return await OpenAlexService.enrich(merged, crossrefEmail)
                }
                return merged
              }
            } catch (err) {
              console.warn('CrossRef validation failed:', err.message)
            }
          }

          // Enrich with OpenAlex
          if (sources.openalex) {
            return await OpenAlexService.enrich(aiResult, crossrefEmail)
          }
          return aiResult
        } else {
          console.log('AI extraction returned empty or invalid result')
        }
      } catch (err) {
        console.warn('AI extraction failed:', err.message)
        errors.push({ source: 'ai', error: err.message })
      }
    }

    // Step 4: Fallback to title-based API search (less reliable)
    console.log('Falling back to title-based search:', possibleTitle)

    // Try CrossRef title search
    if (sources.crossref) {
      try {
        const crossrefTitleResult = await CrossRefService.searchByTitle(possibleTitle)
        if (crossrefTitleResult && this.isGoodMatch(crossrefTitleResult, possibleTitle)) {
          console.log('CrossRef title search match')
          if (sources.openalex) {
            return await OpenAlexService.enrich(crossrefTitleResult, crossrefEmail)
          }
          return crossrefTitleResult
        } else if (crossrefTitleResult) {
          console.log('CrossRef title search result did not match well enough')
        }
      } catch (err) {
        console.warn('CrossRef title search failed:', err.message)
        errors.push({ source: 'crossref_title', error: err.message })
      }
    }

    // Try Semantic Scholar (may fail due to CORS in browser)
    if (sources.semantic_scholar) {
      try {
        const ssResult = await SemanticScholarService.search(possibleTitle)
        if (ssResult) {
          console.log('Semantic Scholar match found')
          if (sources.openalex) {
            return await OpenAlexService.enrich(ssResult, crossrefEmail)
          }
          return ssResult
        }
      } catch (err) {
        console.warn('Semantic Scholar search failed (likely CORS):', err.message)
        errors.push({ source: 'semantic_scholar', error: err.message })
      }
    }

    // Try OpenAlex direct search as last resort
    if (sources.openalex) {
      try {
        const openAlexResult = await OpenAlexService.searchByTitle(possibleTitle, crossrefEmail)
        if (openAlexResult && openAlexResult.title) {
          console.log('OpenAlex direct search match found')
          return openAlexResult
        }
      } catch (err) {
        console.warn('OpenAlex direct search failed:', err.message)
        errors.push({ source: 'openalex', error: err.message })
      }
    }

    // Step 5: Return empty template for manual entry
    console.log('No metadata found, returning manual template')
    const template = this.createManualTemplate(filename, possibleTitle)
    template.extraction_errors = errors
    return template
  },

  /**
   * Merge metadata from two sources, preferring higher confidence values
   */
  mergeMetadata(primary, secondary, source) {
    const merged = { ...primary }

    // Merge fields where secondary has higher confidence or primary is missing
    const fieldsToMerge = ['doi', 'journal', 'volume', 'issue', 'pages', 'year', 'abstract', 'url']

    for (const field of fieldsToMerge) {
      const primaryConf = primary.extraction_confidence?.[field] || 0
      const secondaryConf = secondary.extraction_confidence?.[field] || 0

      if (!primary[field] || (secondaryConf > primaryConf && secondary[field])) {
        merged[field] = secondary[field]
        if (merged.extraction_confidence) {
          merged.extraction_confidence[field] = secondaryConf
        }
      }
    }

    // Use URL from secondary if we got DOI from there
    if (merged.doi && !merged.url) {
      merged.url = `https://doi.org/${merged.doi}`
    }

    // Merge keywords
    const allKeywords = new Set([
      ...(primary.keywords || []),
      ...(secondary.keywords || [])
    ])
    merged.keywords = Array.from(allKeywords).slice(0, 10)

    merged.extraction_source = source
    return merged
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

  extractDOIFromFilename(filename) {
    // Try to extract DOI from common publisher filename patterns

    // ScienceDirect: "1-s2.0-S2352152X26002410-main.pdf"
    // The S number is a PII (Publisher Item Identifier), not a DOI
    // But we can try to construct potential DOI patterns

    // Check for embedded DOI in filename
    const doiMatch = filename.match(/(10\.\d{4,}[^\s]+)/i)
    if (doiMatch) {
      const cleaned = this.cleanDOI(doiMatch[1])
      if (cleaned) {
        console.log('Found DOI embedded in filename:', cleaned)
        return cleaned
      }
    }

    // IEEE format often has DOI in filename
    const ieeeMatch = filename.match(/(\d{7,})/i)
    if (ieeeMatch && filename.toLowerCase().includes('ieee')) {
      console.log('Possible IEEE paper, ID:', ieeeMatch[1])
      // Can't construct DOI without lookup
    }

    return null
  },

  extractPossibleTitle(text, filename) {
    // PDF text often has poor formatting - use multiple strategies
    const headerText = text.slice(0, 5000) // Focus on first part

    // Strategy 1: Look for text before common markers
    const markers = [
      /\bAbstract\b/i,
      /\bIntroduction\b/i,
      /\bKeywords?\s*:/i,
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\s*[,\d]?\s*[A-Z][a-z]+\s+[A-Z][a-z]+/,  // Author names pattern
      /\buniversity\b/i,
      /\bdepartment\b/i,
      /\bReceived\s+\d/i,
      /\bAccepted\s+\d/i,
    ]

    for (const marker of markers) {
      const match = headerText.match(marker)
      if (match && match.index > 50) {
        const beforeMarker = headerText.slice(0, match.index).trim()
        const title = this.extractTitleFromChunk(beforeMarker)
        if (title && title.length > 20) {
          console.log('Extracted title before marker:', marker.toString())
          return title
        }
      }
    }

    // Strategy 2: Look for the longest "title-like" sentence in first 2000 chars
    const veryEarly = headerText.slice(0, 2000)
    const sentences = veryEarly
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+|(?=\n)/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 300)

    // Score sentences by how "title-like" they are
    let bestTitle = null
    let bestScore = 0

    for (const sentence of sentences) {
      const score = this.scoreTitleCandidate(sentence)
      if (score > bestScore) {
        bestScore = score
        bestTitle = sentence
      }
    }

    if (bestTitle && bestScore > 3) {
      console.log('Best title candidate score:', bestScore)
      return bestTitle
    }

    // Strategy 3: Split by double spaces or newlines and find best chunk
    const chunks = headerText
      .split(/\n\n+|\s{3,}/)
      .map(c => c.replace(/\s+/g, ' ').trim())
      .filter(c => c.length > 20 && c.length < 300)

    for (const chunk of chunks.slice(0, 10)) {
      const score = this.scoreTitleCandidate(chunk)
      if (score > 3) {
        console.log('Title from chunk, score:', score)
        return chunk
      }
    }

    // Strategy 4: Just take first substantial text that looks academic
    const firstText = headerText
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)

    const titleMatch = firstText.match(/^(.{30,200}?)(?:\s+[A-Z][a-z]+\s+[A-Z]|\s+\d{1,2}\s|Abstract|Keywords)/i)
    if (titleMatch) {
      console.log('Title from first text pattern')
      return titleMatch[1].trim()
    }

    // Last resort: use cleaned filename, but warn
    console.warn('Could not extract title, using filename')
    return this.cleanFilenameAsTitle(filename)
  },

  extractTitleFromChunk(chunk) {
    // Clean and extract the best title-like portion from a chunk
    const cleaned = chunk
      .replace(/\s+/g, ' ')
      .replace(/^[\d\s.]+/, '') // Remove leading page numbers
      .replace(/journal of .+$/i, '') // Remove journal names at end
      .trim()

    // If it's too long, try to find a natural break
    if (cleaned.length > 250) {
      const breakMatch = cleaned.match(/^(.{50,200}?)(?:\.\s|:\s|\s-\s)/)
      if (breakMatch) return breakMatch[1]
      return cleaned.slice(0, 200)
    }

    return cleaned
  },

  scoreTitleCandidate(text) {
    let score = 0

    // Length scoring
    if (text.length >= 30 && text.length <= 200) score += 2
    else if (text.length >= 20 && text.length <= 250) score += 1

    // Capitalization patterns (Title Case or ALL CAPS common in titles)
    const words = text.split(/\s+/)
    const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length
    if (capitalizedWords / words.length > 0.5) score += 2

    // Contains academic keywords
    if (/\b(analysis|study|review|method|model|system|approach|based|using|novel|new|improved)\b/i.test(text)) score += 2

    // Doesn't look like an author line
    if (!/^[A-Z][a-z]+\s+[A-Z][a-z]+\s*,/.test(text)) score += 1

    // Doesn't contain email patterns
    if (!/@/.test(text)) score += 1

    // Doesn't start with numbers (except years)
    if (!/^\d+(?!\d{3})/.test(text)) score += 1

    // No common non-title patterns
    if (!/\b(university|department|received|accepted|email|corresponding|author)\b/i.test(text)) score += 1

    // Has good alpha ratio
    const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length
    if (alphaRatio > 0.7) score += 1
    else if (alphaRatio > 0.5) score += 0.5

    return score
  },

  cleanFilenameAsTitle(filename) {
    // Handle ScienceDirect and other common filename patterns
    let cleaned = filename
      .replace(/\.pdf$/i, '')
      .replace(/^[\d\s._-]+/, '') // Remove leading numbers/punctuation
      .replace(/s2\.0-S\d+[-_]main/i, '') // ScienceDirect pattern
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // If we stripped too much, return original cleaned filename
    if (cleaned.length < 5) {
      cleaned = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim()
    }

    return cleaned
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
