/**
 * GROBIDService - ML-based PDF metadata extraction
 *
 * GROBID (GeneRation Of BIbliographic Data) is an ML library for extracting
 * bibliographic information from academic documents with 90%+ accuracy.
 *
 * Uses free hosted API endpoints:
 * - HuggingFace: https://kermitt2-grobid.hf.space/api/processHeaderDocument
 * - ScienceMiner (backup): https://cloud.science-miner.com/grobid/api/processHeaderDocument
 *
 * Privacy note: Full PDF is sent to external server for processing.
 */

const ENDPOINTS = {
  huggingface: 'https://kermitt2-grobid.hf.space/api/processHeaderDocument',
  scienceminer: 'https://cloud.science-miner.com/grobid/api/processHeaderDocument'
}

const TIMEOUT_MS = 30000

export const GROBIDService = {
  /**
   * Extract metadata from PDF using GROBID
   * @param {ArrayBuffer} pdfBuffer - Raw PDF bytes
   * @param {string} endpoint - 'huggingface' or 'scienceminer'
   * @returns {Promise<object|null>} Normalized metadata or null on failure
   */
  async extract(pdfBuffer, endpoint = 'huggingface') {
    const url = ENDPOINTS[endpoint] || ENDPOINTS.huggingface

    console.log(`GROBID: Sending PDF to ${endpoint} endpoint...`)

    try {
      const formData = new FormData()
      formData.append('input', new Blob([pdfBuffer], { type: 'application/pdf' }), 'document.pdf')

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/xml'
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        // Handle specific error codes
        if (response.status === 503) {
          console.warn('GROBID: Service overloaded (503)')
          throw new Error('GROBID service is overloaded')
        }
        if (response.status === 429) {
          console.warn('GROBID: Rate limited (429)')
          throw new Error('GROBID rate limit exceeded')
        }
        throw new Error(`GROBID request failed: ${response.status}`)
      }

      const teiXml = await response.text()
      console.log('GROBID: Received TEI/XML response')

      return this.parseTEI(teiXml)
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('GROBID: Request timed out')
        throw new Error('GROBID request timed out')
      }
      throw error
    }
  },

  /**
   * Try extraction with fallback to backup endpoint
   * @param {ArrayBuffer} pdfBuffer - Raw PDF bytes
   * @param {string} preferredEndpoint - Primary endpoint to try
   * @returns {Promise<object|null>} Normalized metadata or null
   */
  async extractWithFallback(pdfBuffer, preferredEndpoint = 'huggingface') {
    const endpoints = preferredEndpoint === 'huggingface'
      ? ['huggingface', 'scienceminer']
      : ['scienceminer', 'huggingface']

    for (const endpoint of endpoints) {
      try {
        const result = await this.extract(pdfBuffer, endpoint)
        if (result && result.title) {
          return result
        }
      } catch (error) {
        console.warn(`GROBID ${endpoint} failed:`, error.message)
        // Continue to next endpoint
      }
    }

    return null
  },

  /**
   * Parse TEI/XML response from GROBID
   * @param {string} teiXml - TEI XML string
   * @returns {object} Normalized metadata
   */
  parseTEI(teiXml) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(teiXml, 'application/xml')

    // Check for parsing errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      console.error('GROBID: XML parsing error')
      return null
    }

    // Define namespace resolver for TEI
    const ns = (prefix) => {
      const namespaces = {
        'tei': 'http://www.tei-c.org/ns/1.0'
      }
      return namespaces[prefix] || null
    }

    // Helper to query with namespace
    const query = (xpath) => {
      try {
        // Try with namespace first
        const result = doc.evaluate(
          xpath.replace(/\/\//g, '//tei:').replace(/^tei:/, ''),
          doc,
          ns,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        )
        if (result.singleNodeValue) {
          return result.singleNodeValue.textContent?.trim()
        }
      } catch (e) {
        // Namespace query failed
      }

      // Fallback: try without namespace
      const elements = doc.getElementsByTagName(xpath.split('/').pop())
      return elements[0]?.textContent?.trim() || null
    }

    // Extract title
    let title = null
    const titleStmt = doc.getElementsByTagName('titleStmt')[0]
    if (titleStmt) {
      const titleEl = titleStmt.getElementsByTagName('title')[0]
      title = titleEl?.textContent?.trim()
    }
    if (!title) {
      // Try analytic title
      const analytic = doc.getElementsByTagName('analytic')[0]
      if (analytic) {
        const titleEl = analytic.getElementsByTagName('title')[0]
        title = titleEl?.textContent?.trim()
      }
    }

    // Extract authors
    const authors = []
    const authorElements = doc.getElementsByTagName('author')
    for (const author of authorElements) {
      const persName = author.getElementsByTagName('persName')[0]
      if (persName) {
        const surname = persName.getElementsByTagName('surname')[0]?.textContent?.trim()
        const forename = persName.getElementsByTagName('forename')[0]?.textContent?.trim()

        if (surname) {
          const authorObj = {
            last: surname,
            first: forename || '',
            orcid: null
          }

          // Try to extract ORCID from idno
          const idno = author.getElementsByTagName('idno')
          for (const id of idno) {
            if (id.getAttribute('type') === 'ORCID') {
              authorObj.orcid = id.textContent?.trim()
            }
          }

          // Try to extract affiliation
          const affiliation = author.getElementsByTagName('affiliation')[0]
          if (affiliation) {
            const orgName = affiliation.getElementsByTagName('orgName')[0]
            authorObj.affiliation = orgName?.textContent?.trim()
          }

          authors.push(authorObj)
        }
      }
    }

    // Extract DOI
    let doi = null
    const idnoElements = doc.getElementsByTagName('idno')
    for (const idno of idnoElements) {
      if (idno.getAttribute('type') === 'DOI') {
        doi = idno.textContent?.trim()
        break
      }
    }

    // Extract abstract
    let abstract = null
    const abstractEl = doc.getElementsByTagName('abstract')[0]
    if (abstractEl) {
      // Get all paragraph text
      const paragraphs = abstractEl.getElementsByTagName('p')
      if (paragraphs.length > 0) {
        abstract = Array.from(paragraphs)
          .map(p => p.textContent?.trim())
          .filter(Boolean)
          .join(' ')
      } else {
        // No paragraphs, get direct text
        abstract = abstractEl.textContent?.trim()
      }
    }

    // Extract journal/conference info from monogr
    let journal = null
    let volume = null
    let issue = null
    let pages = null
    let year = null

    const monogr = doc.getElementsByTagName('monogr')[0]
    if (monogr) {
      // Journal title
      const journalTitle = monogr.getElementsByTagName('title')[0]
      journal = journalTitle?.textContent?.trim()

      // Imprint contains volume, pages, date
      const imprint = monogr.getElementsByTagName('imprint')[0]
      if (imprint) {
        const biblScope = imprint.getElementsByTagName('biblScope')
        for (const scope of biblScope) {
          const unit = scope.getAttribute('unit')
          if (unit === 'volume') {
            volume = scope.textContent?.trim()
          } else if (unit === 'issue') {
            issue = scope.textContent?.trim()
          } else if (unit === 'page') {
            const from = scope.getAttribute('from')
            const to = scope.getAttribute('to')
            if (from && to) {
              pages = `${from}-${to}`
            } else {
              pages = scope.textContent?.trim()
            }
          }
        }

        // Publication date
        const dateEl = imprint.getElementsByTagName('date')[0]
        if (dateEl) {
          const when = dateEl.getAttribute('when')
          if (when) {
            year = parseInt(when.slice(0, 4), 10)
          }
        }
      }
    }

    // If no year from imprint, try other date elements
    if (!year) {
      const dateElements = doc.getElementsByTagName('date')
      for (const dateEl of dateElements) {
        const when = dateEl.getAttribute('when')
        if (when) {
          const parsed = parseInt(when.slice(0, 4), 10)
          if (parsed > 1900 && parsed < 2100) {
            year = parsed
            break
          }
        }
      }
    }

    // Extract keywords
    const keywords = []
    const keywordsEl = doc.getElementsByTagName('keywords')[0]
    if (keywordsEl) {
      const terms = keywordsEl.getElementsByTagName('term')
      for (const term of terms) {
        const kw = term.textContent?.trim()
        if (kw) keywords.push(kw)
      }
    }

    // Build confidence scores based on what was extracted
    const confidence = {
      title: title ? 95 : 0,
      authors: authors.length > 0 ? 92 : 0,
      journal: journal ? 90 : 0,
      doi: doi ? 98 : 0,
      year: year ? 93 : 0,
      abstract: abstract ? 90 : 0
    }

    console.log('GROBID: Extracted metadata:', {
      title: title?.slice(0, 50),
      authors: authors.length,
      doi,
      year,
      journal: journal?.slice(0, 30)
    })

    return {
      title: title || '',
      authors,
      year,
      journal: journal || '',
      volume: volume || '',
      issue: issue || '',
      pages: pages || '',
      doi: doi || '',
      abstract: abstract || '',
      keywords,
      type: 'journal-article',
      url: doi ? `https://doi.org/${doi}` : '',
      extraction_source: 'grobid',
      extraction_confidence: confidence
    }
  },

  /**
   * Check if GROBID service is available
   * @param {string} endpoint - Endpoint to check
   * @returns {Promise<boolean>}
   */
  async isAvailable(endpoint = 'huggingface') {
    const url = ENDPOINTS[endpoint]
    if (!url) return false

    try {
      // GROBID has a simple alive endpoint
      const response = await fetch(url.replace('processHeaderDocument', 'isalive'), {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch {
      return false
    }
  }
}
