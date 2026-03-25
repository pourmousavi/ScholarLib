/**
 * DuplicateDetector - Detect duplicate documents during import
 *
 * Uses multiple strategies to identify potential duplicates:
 * 1. Exact DOI match (100% confidence)
 * 2. Exact title match (90% confidence)
 * 3. Fuzzy title match (85% confidence)
 * 4. Title + Year + First Author (80% confidence)
 */

/**
 * Build lookup indices for existing documents
 * Pre-indexes by DOI and normalized title for O(1) lookups
 * @param {Object} existingDocs - Existing documents keyed by ID
 * @returns {Object} Lookup indices
 */
function buildDocumentIndex(existingDocs) {
  const byDOI = new Map()
  const byNormalizedTitle = new Map()
  const allDocs = []

  for (const [docId, doc] of Object.entries(existingDocs)) {
    const meta = doc.metadata || {}

    // Index by DOI
    if (meta.doi) {
      const normalizedDoi = normalizeDOI(meta.doi)
      if (normalizedDoi) {
        byDOI.set(normalizedDoi, { docId, doc })
      }
    }

    // Index by normalized title
    if (meta.title) {
      const normalizedTitle = normalizeTitle(meta.title)
      if (normalizedTitle.length > 10) {
        // Store as array to handle title collisions
        if (!byNormalizedTitle.has(normalizedTitle)) {
          byNormalizedTitle.set(normalizedTitle, [])
        }
        byNormalizedTitle.get(normalizedTitle).push({ docId, doc })
      }
    }

    allDocs.push({ docId, doc })
  }

  return { byDOI, byNormalizedTitle, allDocs }
}

/**
 * Find potential duplicates for a document using indexed lookups
 * @param {Object} importDoc - Document being imported
 * @param {Object} existingDocs - Existing documents keyed by ID
 * @param {Object} index - Pre-built document index (optional)
 * @returns {Array<{docId: string, confidence: number, reason: string}>}
 */
export function findDuplicates(importDoc, existingDocs, index = null) {
  const duplicates = []
  const importMeta = importDoc.metadata || {}

  // Use provided index or fall back to checking all docs
  if (index) {
    // O(1) DOI lookup
    if (importMeta.doi) {
      const normalizedDoi = normalizeDOI(importMeta.doi)
      if (normalizedDoi && index.byDOI.has(normalizedDoi)) {
        const { docId, doc } = index.byDOI.get(normalizedDoi)
        duplicates.push({
          docId,
          document: doc,
          confidence: 100,
          reason: 'Exact DOI match'
        })
        return duplicates // DOI is definitive
      }
    }

    // O(1) Exact title lookup
    if (importMeta.title) {
      const normalizedTitle = normalizeTitle(importMeta.title)
      if (normalizedTitle.length > 10 && index.byNormalizedTitle.has(normalizedTitle)) {
        const matches = index.byNormalizedTitle.get(normalizedTitle)
        for (const { docId, doc } of matches) {
          duplicates.push({
            docId,
            document: doc,
            confidence: 90,
            reason: 'Exact title match'
          })
        }
        if (duplicates.length > 0) {
          duplicates.sort((a, b) => b.confidence - a.confidence)
          return duplicates
        }
      }

      // Fuzzy title matching still needs linear scan but only if exact didn't match
      for (const { docId, doc } of index.allDocs) {
        const existingMeta = doc.metadata || {}
        if (!existingMeta.title) continue

        const existingTitle = normalizeTitle(existingMeta.title)
        const similarity = calculateSimilarity(normalizedTitle, existingTitle)

        if (similarity > 0.85) {
          duplicates.push({
            docId,
            document: doc,
            confidence: Math.round(85 * similarity),
            reason: `Title similarity: ${Math.round(similarity * 100)}%`
          })
        } else if (similarity > 0.7) {
          // Title + Year + First Author check
          const sameYear = importMeta.year && existingMeta.year &&
                           importMeta.year === existingMeta.year
          const sameFirstAuthor = checkFirstAuthorMatch(
            importMeta.authors,
            existingMeta.authors
          )

          if (sameYear && sameFirstAuthor) {
            duplicates.push({
              docId,
              document: doc,
              confidence: 80,
              reason: 'Title + Year + First Author match'
            })
          }
        }
      }
    }
  } else {
    // Fallback: Original O(n) implementation
    for (const [docId, existingDoc] of Object.entries(existingDocs)) {
      const match = checkMatch(importDoc, existingDoc)
      if (match) {
        duplicates.push({
          docId,
          document: existingDoc,
          confidence: match.confidence,
          reason: match.reason
        })
      }
    }
  }

  // Sort by confidence (highest first)
  duplicates.sort((a, b) => b.confidence - a.confidence)

  return duplicates
}

/**
 * Check if two documents match
 * @param {Object} importDoc - Document being imported
 * @param {Object} existingDoc - Existing document
 * @returns {Object|null} { confidence, reason } or null if no match
 */
function checkMatch(importDoc, existingDoc) {
  const importMeta = importDoc.metadata || {}
  const existingMeta = existingDoc.metadata || {}

  // 1. Exact DOI match (100% confidence)
  if (importMeta.doi && existingMeta.doi) {
    const importDoi = normalizeDOI(importMeta.doi)
    const existingDoi = normalizeDOI(existingMeta.doi)

    if (importDoi === existingDoi) {
      return {
        confidence: 100,
        reason: 'Exact DOI match'
      }
    }
  }

  // 2. Exact title match (90% confidence)
  if (importMeta.title && existingMeta.title) {
    const importTitle = normalizeTitle(importMeta.title)
    const existingTitle = normalizeTitle(existingMeta.title)

    if (importTitle === existingTitle && importTitle.length > 10) {
      return {
        confidence: 90,
        reason: 'Exact title match'
      }
    }

    // 3. Fuzzy title match (85% confidence)
    const similarity = calculateSimilarity(importTitle, existingTitle)
    if (similarity > 0.85) {
      return {
        confidence: Math.round(85 * similarity),
        reason: `Title similarity: ${Math.round(similarity * 100)}%`
      }
    }

    // 4. Title + Year + First Author (80% confidence)
    if (similarity > 0.7) {
      const sameYear = importMeta.year && existingMeta.year &&
                       importMeta.year === existingMeta.year
      const sameFirstAuthor = checkFirstAuthorMatch(
        importMeta.authors,
        existingMeta.authors
      )

      if (sameYear && sameFirstAuthor) {
        return {
          confidence: 80,
          reason: 'Title + Year + First Author match'
        }
      }
    }
  }

  return null
}

/**
 * Normalize DOI for comparison
 * @param {string} doi
 * @returns {string}
 */
function normalizeDOI(doi) {
  if (!doi) return ''
  // Remove URL prefix, lowercase
  return doi
    .replace(/^https?:\/\/doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .toLowerCase()
    .trim()
}

/**
 * Normalize title for comparison
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
  if (!title) return ''
  return title
    .toLowerCase()
    // Remove punctuation
    .replace(/[^\w\s]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Check if first authors match
 * @param {Array} authors1
 * @param {Array} authors2
 * @returns {boolean}
 */
function checkFirstAuthorMatch(authors1, authors2) {
  if (!authors1?.length || !authors2?.length) return false

  const first1 = normalizeAuthor(authors1[0])
  const first2 = normalizeAuthor(authors2[0])

  if (!first1 || !first2) return false

  // Check last name match
  return first1.last === first2.last
}

/**
 * Normalize author name
 * @param {Object} author
 * @returns {Object}
 */
function normalizeAuthor(author) {
  if (!author) return null
  return {
    first: (author.first || '').toLowerCase().trim(),
    last: (author.last || '').toLowerCase().trim()
  }
}

/**
 * Calculate string similarity (Sørensen-Dice coefficient)
 * @param {string} s1
 * @param {string} s2
 * @returns {number} Similarity from 0 to 1
 */
function calculateSimilarity(s1, s2) {
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1

  // Use bigrams
  const bigrams1 = getBigrams(s1)
  const bigrams2 = getBigrams(s2)

  if (bigrams1.size === 0 && bigrams2.size === 0) return 1
  if (bigrams1.size === 0 || bigrams2.size === 0) return 0

  // Calculate intersection
  let intersection = 0
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) {
      intersection++
    }
  }

  // Dice coefficient
  return (2 * intersection) / (bigrams1.size + bigrams2.size)
}

/**
 * Get bigrams (character pairs) from string
 * @param {string} str
 * @returns {Set}
 */
function getBigrams(str) {
  const bigrams = new Set()
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.slice(i, i + 2))
  }
  return bigrams
}

/**
 * Batch check for duplicates
 * Uses pre-built index for O(n) total complexity instead of O(n*m)
 * @param {Array} importDocs - Documents being imported
 * @param {Object} existingDocs - Existing documents keyed by ID
 * @returns {Map<number, Array>} Map of import index to duplicate matches
 */
export function batchFindDuplicates(importDocs, existingDocs) {
  const results = new Map()

  // Build index once, use for all documents
  const index = buildDocumentIndex(existingDocs)

  for (let i = 0; i < importDocs.length; i++) {
    const duplicates = findDuplicates(importDocs[i], existingDocs, index)
    if (duplicates.length > 0) {
      results.set(i, duplicates)
    }
  }

  return results
}

/**
 * Merge duplicate resolution choices
 * @param {Object} existingDoc - The existing document to keep
 * @param {Object} importDoc - The imported document
 * @param {string} strategy - 'keep_existing' | 'replace' | 'merge_metadata'
 * @returns {Object} Updated document
 */
export function resolveDuplicate(existingDoc, importDoc, strategy) {
  switch (strategy) {
    case 'keep_existing':
      return existingDoc

    case 'replace':
      // Replace but keep file references and ID
      return {
        ...importDoc,
        id: existingDoc.id,
        box_path: existingDoc.box_path,
        box_file_id: existingDoc.box_file_id,
        filename: existingDoc.filename,
        folder_id: existingDoc.folder_id,
        user_data: {
          ...existingDoc.user_data,
          // Merge tags
          tags: [...new Set([
            ...(existingDoc.user_data?.tags || []),
            ...(importDoc.user_data?.tags || [])
          ])]
        }
      }

    case 'merge_metadata':
      // Merge metadata from both, preferring non-null values
      return {
        ...existingDoc,
        metadata: mergeMetadata(existingDoc.metadata, importDoc.metadata),
        user_data: {
          ...existingDoc.user_data,
          tags: [...new Set([
            ...(existingDoc.user_data?.tags || []),
            ...(importDoc.user_data?.tags || [])
          ])]
        }
      }

    default:
      return existingDoc
  }
}

/**
 * Merge metadata objects, preferring non-null values from import
 * @param {Object} existing
 * @param {Object} imported
 * @returns {Object}
 */
function mergeMetadata(existing, imported) {
  const result = { ...existing }

  for (const [key, value] of Object.entries(imported)) {
    // Prefer imported value if existing is null/undefined
    if (result[key] == null && value != null) {
      result[key] = value
    }
    // For arrays, merge and dedupe
    if (Array.isArray(result[key]) && Array.isArray(value)) {
      if (key === 'authors') {
        // Special handling for authors - merge by last name
        result[key] = mergeAuthors(result[key], value)
      } else {
        result[key] = [...new Set([...result[key], ...value])]
      }
    }
  }

  return result
}

/**
 * Merge author arrays
 * @param {Array} existing
 * @param {Array} imported
 * @returns {Array}
 */
function mergeAuthors(existing, imported) {
  const byLastName = new Map()

  for (const author of existing) {
    const key = (author.last || '').toLowerCase()
    byLastName.set(key, author)
  }

  for (const author of imported) {
    const key = (author.last || '').toLowerCase()
    if (!byLastName.has(key)) {
      byLastName.set(key, author)
    }
  }

  return Array.from(byLastName.values())
}
