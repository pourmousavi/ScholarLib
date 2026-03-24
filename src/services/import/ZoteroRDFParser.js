/**
 * ZoteroRDFParser - Parse Zotero RDF export files
 *
 * Zotero RDF uses Dublin Core and Zotero-specific namespaces to encode
 * bibliographic data, collections, tags, notes, and attachments.
 */

// RDF/XML namespaces
const NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  prism: 'http://prismstandard.org/namespaces/1.2/basic/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  bib: 'http://purl.org/net/biblio#',
  z: 'http://www.zotero.org/namespaces/export#',
  link: 'http://purl.org/rss/1.0/modules/link/'
}

/**
 * Parse Zotero RDF export
 * @param {string} rdfContent - The RDF/XML content as string
 * @returns {Object} Parsed data { items, collections, tags, attachments, notes }
 */
export function parseZoteroRDF(rdfContent) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rdfContent, 'application/xml')

  // Check for parse errors
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Invalid RDF/XML: ' + parseError.textContent)
  }

  const result = {
    items: [],
    collections: [],
    tags: new Set(),
    attachments: [],
    notes: [],
    stats: {
      itemCount: 0,
      collectionCount: 0,
      tagCount: 0,
      attachmentCount: 0,
      noteCount: 0
    }
  }

  // Parse collections first (to build hierarchy)
  const collectionElements = doc.querySelectorAll('Collection, *|Collection')
  for (const el of collectionElements) {
    const collection = parseCollection(el)
    if (collection) {
      result.collections.push(collection)
    }
  }
  result.stats.collectionCount = result.collections.length

  // Build collection hierarchy
  buildCollectionHierarchy(result.collections)

  // Parse items (articles, books, etc.)
  const itemElements = findBibItems(doc)
  for (const el of itemElements) {
    const item = parseItem(el, doc)
    if (item) {
      result.items.push(item)

      // Collect tags
      for (const tag of item.tags) {
        result.tags.add(tag)
      }
    }
  }
  result.stats.itemCount = result.items.length
  result.stats.tagCount = result.tags.size

  // Convert tags Set to Array
  result.tags = Array.from(result.tags)

  // Parse standalone notes (attached to items)
  const memoElements = doc.querySelectorAll('Memo, *|Memo')
  for (const el of memoElements) {
    const note = parseNote(el)
    if (note) {
      result.notes.push(note)
    }
  }
  result.stats.noteCount = result.notes.length

  // Parse attachments
  const attachmentElements = doc.querySelectorAll('Attachment, *|Attachment')
  for (const el of attachmentElements) {
    const attachment = parseAttachment(el)
    if (attachment) {
      result.attachments.push(attachment)
    }
  }
  result.stats.attachmentCount = result.attachments.length

  // Link attachments and notes to their parent items
  linkAttachmentsToItems(result)
  linkNotesToItems(result)

  return result
}

/**
 * Find all bibliographic items in the document
 * @param {Document} doc
 * @returns {NodeList}
 */
function findBibItems(doc) {
  // Zotero uses various bib: types
  const types = [
    'Article', 'Book', 'BookSection', 'ConferencePaper',
    'Thesis', 'Report', 'Manuscript', 'Patent',
    'Legislation', 'Interview', 'Document'
  ]

  const items = []
  for (const type of types) {
    const elements = doc.querySelectorAll(`${type}, *|${type}`)
    items.push(...elements)
  }

  return items
}

/**
 * Parse a single bibliographic item
 * @param {Element} el
 * @param {Document} doc
 * @returns {Object}
 */
function parseItem(el, doc) {
  const about = el.getAttributeNS(NS.rdf, 'about') || el.getAttribute('rdf:about')

  const item = {
    id: about,
    type: el.localName || el.tagName.replace(/^.*:/, ''),
    title: getTextContent(el, 'dc:title'),
    abstract: getTextContent(el, 'dcterms:abstract'),
    date: getTextContent(el, 'dc:date'),
    language: getTextContent(el, 'dc:language'),
    rights: getTextContent(el, 'dc:rights'),

    // Identifiers
    doi: extractDOI(el),
    isbn: getTextContent(el, 'dc:identifier', 'ISBN'),
    issn: getTextContent(el, 'dc:identifier', 'ISSN'),
    url: getTextContent(el, 'dc:identifier', 'URL') || getTextContent(el, 'bib:uri'),

    // Authors
    authors: parseAuthors(el),

    // Journal/publication info
    journal: parseJournal(el, doc),
    volume: getTextContent(el, 'prism:volume'),
    issue: getTextContent(el, 'prism:number'),
    pages: getTextContent(el, 'bib:pages'),

    // Tags/keywords
    tags: parseTags(el),

    // Collections this item belongs to
    collections: parseItemCollections(el),

    // Zotero-specific
    zoteroKey: getTextContent(el, 'z:key'),
    itemType: getTextContent(el, 'z:itemType'),
    dateAdded: getTextContent(el, 'z:dateAdded'),
    dateModified: getTextContent(el, 'z:dateModified'),

    // Links to attachments and notes
    attachmentIds: [],
    noteIds: []
  }

  // Parse links to attachments
  const linkElements = el.querySelectorAll('link, *|link')
  for (const linkEl of linkElements) {
    const resource = linkEl.getAttributeNS(NS.rdf, 'resource') ||
                     linkEl.getAttribute('rdf:resource')
    if (resource) {
      item.attachmentIds.push(resource)
    }
  }

  return item
}

/**
 * Extract DOI from identifier elements
 * @param {Element} el
 * @returns {string|null}
 */
function extractDOI(el) {
  const identifiers = el.querySelectorAll('*|identifier, identifier')
  for (const id of identifiers) {
    const text = id.textContent?.trim()
    // Match DOI pattern
    const match = text?.match(/10\.\d{4,}\/[^\s]+/)
    if (match) return match[0]
  }

  // Check for explicit DOI field
  const doiEl = el.querySelector('DOI, *|DOI')
  if (doiEl) return doiEl.textContent?.trim()

  return null
}

/**
 * Parse authors from element
 * @param {Element} el
 * @returns {Array}
 */
function parseAuthors(el) {
  const authors = []

  // Try bib:authors container
  const authorsContainer = el.querySelector('authors, *|authors')
  if (authorsContainer) {
    const seqElements = authorsContainer.querySelectorAll('Seq li, *|Seq *|li')
    for (const li of seqElements) {
      const person = parsePersonElement(li)
      if (person) authors.push(person)
    }
  }

  // Try dc:creator elements
  const creators = el.querySelectorAll('creator, *|creator')
  for (const creator of creators) {
    const person = parsePersonElement(creator)
    if (person) authors.push(person)
  }

  // Deduplicate by name
  const seen = new Set()
  return authors.filter(a => {
    const key = `${a.first}|${a.last}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Parse a Person element (foaf:Person or nested)
 * @param {Element} el
 * @returns {Object|null}
 */
function parsePersonElement(el) {
  // Look for nested foaf:Person
  const personEl = el.querySelector('Person, *|Person') || el

  const surname = getTextContent(personEl, 'foaf:surname') ||
                  getTextContent(personEl, 'surname')
  const givenName = getTextContent(personEl, 'foaf:givenName') ||
                    getTextContent(personEl, 'givenname') ||
                    getTextContent(personEl, 'foaf:givenname')

  // If no structured name, try to parse from text content
  if (!surname && !givenName) {
    const text = personEl.textContent?.trim()
    if (text) {
      // Try "Last, First" format
      if (text.includes(',')) {
        const [last, first] = text.split(',').map(s => s.trim())
        return { last, first }
      }
      // Try "First Last" format
      const parts = text.split(/\s+/)
      if (parts.length >= 2) {
        return {
          first: parts.slice(0, -1).join(' '),
          last: parts[parts.length - 1]
        }
      }
      return { first: '', last: text }
    }
    return null
  }

  return {
    first: givenName || '',
    last: surname || ''
  }
}

/**
 * Parse journal information
 * @param {Element} el
 * @param {Document} doc
 * @returns {Object}
 */
function parseJournal(el, doc) {
  // Try dcterms:isPartOf which references a Journal
  const isPartOf = el.querySelector('isPartOf, *|isPartOf')
  if (isPartOf) {
    const resource = isPartOf.getAttributeNS(NS.rdf, 'resource') ||
                     isPartOf.getAttribute('rdf:resource')
    if (resource) {
      // Find the referenced Journal element
      const journalEl = doc.querySelector(`[*|about="${resource}"], [rdf\\:about="${resource}"]`)
      if (journalEl) {
        return {
          name: getTextContent(journalEl, 'dc:title'),
          issn: getTextContent(journalEl, 'dc:identifier')
        }
      }
    }

    // Inline journal
    const journalEl = isPartOf.querySelector('Journal, *|Journal')
    if (journalEl) {
      return {
        name: getTextContent(journalEl, 'dc:title'),
        issn: getTextContent(journalEl, 'dc:identifier')
      }
    }
  }

  // Direct publication name
  return {
    name: getTextContent(el, 'prism:publicationName') ||
          getTextContent(el, 'z:publicationTitle'),
    issn: null
  }
}

/**
 * Parse tags/keywords from element
 * @param {Element} el
 * @returns {Array<string>}
 */
function parseTags(el) {
  const tags = []

  // dc:subject elements contain tags
  const subjects = el.querySelectorAll('subject, *|subject')
  for (const subj of subjects) {
    const text = subj.textContent?.trim()
    if (text) tags.push(text)
  }

  return tags
}

/**
 * Parse collection memberships from element
 * @param {Element} el
 * @returns {Array<string>}
 */
function parseItemCollections(el) {
  const collections = []

  // Look for z:Collection references
  const collRefs = el.querySelectorAll('Collection, *|Collection')
  for (const ref of collRefs) {
    const resource = ref.getAttributeNS(NS.rdf, 'resource') ||
                     ref.getAttribute('rdf:resource')
    if (resource) collections.push(resource)
  }

  return collections
}

/**
 * Parse a collection element
 * @param {Element} el
 * @returns {Object}
 */
function parseCollection(el) {
  const about = el.getAttributeNS(NS.rdf, 'about') || el.getAttribute('rdf:about')

  return {
    id: about,
    name: getTextContent(el, 'dc:title') || getTextContent(el, 'z:name'),
    key: getTextContent(el, 'z:key'),
    parentId: null, // Will be resolved later
    children: [],

    // Zotero-specific
    dateAdded: getTextContent(el, 'z:dateAdded'),
    dateModified: getTextContent(el, 'z:dateModified')
  }
}

/**
 * Build collection hierarchy from flat list
 * @param {Array} collections
 */
function buildCollectionHierarchy(collections) {
  const byId = {}
  for (const coll of collections) {
    byId[coll.id] = coll
  }

  // Zotero RDF uses hasPart/isPartOf for hierarchy
  // This is a simplified approach
  // In practice, you'd need to parse the actual hierarchy links
}

/**
 * Parse a note (Memo) element
 * @param {Element} el
 * @returns {Object}
 */
function parseNote(el) {
  const about = el.getAttributeNS(NS.rdf, 'about') || el.getAttribute('rdf:about')

  return {
    id: about,
    content: getTextContent(el, 'rdf:value') || el.textContent?.trim(),
    parentItemId: null, // Will be resolved
    dateAdded: getTextContent(el, 'z:dateAdded'),
    dateModified: getTextContent(el, 'z:dateModified')
  }
}

/**
 * Parse an attachment element
 * @param {Element} el
 * @returns {Object}
 */
function parseAttachment(el) {
  const about = el.getAttributeNS(NS.rdf, 'about') || el.getAttribute('rdf:about')

  return {
    id: about,
    title: getTextContent(el, 'dc:title'),
    path: getTextContent(el, 'z:path') || getTextContent(el, 'link:path'),
    url: getTextContent(el, 'z:url') || getTextContent(el, 'dc:identifier'),
    mimeType: getTextContent(el, 'z:mimeType') || getTextContent(el, 'link:type'),
    parentItemId: null // Will be resolved
  }
}

/**
 * Link attachments to their parent items
 * @param {Object} result - The parsed result object
 */
function linkAttachmentsToItems(result) {
  const attachmentById = {}
  for (const att of result.attachments) {
    attachmentById[att.id] = att
  }

  for (const item of result.items) {
    for (const attId of item.attachmentIds) {
      if (attachmentById[attId]) {
        attachmentById[attId].parentItemId = item.id
      }
    }
  }
}

/**
 * Link notes to their parent items
 * @param {Object} result
 */
function linkNotesToItems(result) {
  // Notes in Zotero RDF are typically referenced from items
  // This is handled during item parsing via the link elements
}

/**
 * Get text content of a child element
 * @param {Element} parent
 * @param {string} selector - Can be namespace:localname
 * @param {string} filter - Optional content filter
 * @returns {string|null}
 */
function getTextContent(parent, selector, filter = null) {
  const [prefix, localName] = selector.includes(':')
    ? selector.split(':')
    : ['', selector]

  // Try direct selector
  const el = parent.querySelector(`${localName}, *|${localName}`)

  if (el) {
    const text = el.textContent?.trim()
    if (filter && !text?.includes(filter)) return null
    return text || null
  }

  // Try with children
  const children = parent.children
  for (const child of children) {
    if (child.localName === localName ||
        child.tagName.endsWith(':' + localName)) {
      const text = child.textContent?.trim()
      if (filter && !text?.includes(filter)) continue
      return text || null
    }
  }

  return null
}

/**
 * Convert parsed Zotero item to ScholarLib document format
 * @param {Object} zoteroItem - Parsed Zotero item
 * @param {string} folderId - Target folder ID
 * @returns {Object} ScholarLib document
 */
export function convertToScholarLibDocument(zoteroItem, folderId) {
  const now = new Date().toISOString()

  return {
    folder_id: folderId,
    filename: '', // Will be set when PDF is uploaded
    box_path: '', // Will be set when PDF is uploaded
    box_file_id: '', // Will be set when PDF is uploaded
    added_at: zoteroItem.dateAdded || now,

    metadata: {
      title: zoteroItem.title || 'Untitled',
      authors: zoteroItem.authors.map(a => ({
        first: a.first,
        last: a.last
      })),
      year: extractYear(zoteroItem.date),
      journal: zoteroItem.journal?.name || null,
      volume: zoteroItem.volume || null,
      issue: zoteroItem.issue || null,
      pages: zoteroItem.pages || null,
      doi: zoteroItem.doi || null,
      abstract: zoteroItem.abstract || null,
      keywords: zoteroItem.tags || [],
      url: zoteroItem.url || null,
      language: zoteroItem.language || null,
      type: mapItemType(zoteroItem.type),
      extraction_source: 'zotero_import',
      extraction_date: now
    },

    user_data: {
      read: false,
      starred: false,
      tags: [], // Tags will be added separately
      rating: null
    },

    index_status: {
      status: 'none'
    },

    // Preserve Zotero metadata for reference
    import_source: {
      type: 'zotero',
      original_id: zoteroItem.id,
      zotero_key: zoteroItem.zoteroKey,
      imported_at: now
    }
  }
}

/**
 * Extract year from date string
 * @param {string} dateStr
 * @returns {number|null}
 */
function extractYear(dateStr) {
  if (!dateStr) return null
  const match = dateStr.match(/\d{4}/)
  return match ? parseInt(match[0], 10) : null
}

/**
 * Map Zotero item type to ScholarLib type
 * @param {string} zoteroType
 * @returns {string}
 */
function mapItemType(zoteroType) {
  const mapping = {
    'Article': 'journal-article',
    'Book': 'book',
    'BookSection': 'book-chapter',
    'ConferencePaper': 'conference-paper',
    'Thesis': 'thesis',
    'Report': 'report',
    'Manuscript': 'manuscript',
    'Patent': 'patent'
  }
  return mapping[zoteroType] || 'document'
}
