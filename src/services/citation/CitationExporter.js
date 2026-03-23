/**
 * CitationExporter - Generates citation exports in multiple academic formats
 *
 * Supported formats:
 * - BibTeX (.bib) - LaTeX, Overleaf, JabRef
 * - RIS (.ris) - Universal (Zotero, Mendeley, EndNote)
 * - CSL-JSON (.json) - Pandoc, modern markdown workflows
 * - EndNote XML (.xml) - EndNote, institutional
 * - APA 7th (.txt) - Formatted plain text
 * - MLA 9th (.txt) - Formatted plain text
 * - Chicago 17th (.txt) - Formatted plain text
 * - Harvard (.txt) - Formatted plain text
 */

// BibTeX special character escaping
const escapeBibTeX = (str) => {
  if (!str) return ''
  return str
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
}

// XML special character escaping
const escapeXML = (str) => {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Generate a citation key from document metadata
const generateCiteKey = (doc) => {
  const authors = doc.metadata?.authors || []
  const year = doc.metadata?.year || 'nd'
  const title = doc.metadata?.title || doc.filename || 'untitled'

  // Get first author's last name
  let authorPart = 'unknown'
  if (authors.length > 0 && authors[0].last) {
    authorPart = authors[0].last.toLowerCase().replace(/[^a-z]/g, '')
  }

  // Get first significant word from title
  const titleWords = title.toLowerCase().split(/\s+/)
  const stopWords = ['a', 'an', 'the', 'of', 'in', 'on', 'for', 'and', 'or', 'to', 'with']
  const titleWord = titleWords.find(w => !stopWords.includes(w) && w.length > 2) || 'paper'
  const cleanTitleWord = titleWord.replace(/[^a-z]/g, '')

  return `${authorPart}${year}${cleanTitleWord}`
}

// Format author name for different citation styles
const formatAuthorName = (author, style = 'bibtex') => {
  const last = author.last || 'Unknown'
  const first = author.first || ''

  switch (style) {
    case 'bibtex':
      return first ? `${last}, ${first}` : last
    case 'ris':
      return first ? `${last}, ${first}` : last
    case 'apa':
      // APA: Last, F. M.
      const initials = first.split(/\s+/).map(n => n.charAt(0).toUpperCase() + '.').join(' ')
      return first ? `${last}, ${initials}` : last
    case 'mla':
      // MLA: Last, First
      return first ? `${last}, ${first}` : last
    case 'chicago':
      // Chicago: First Last
      return first ? `${first} ${last}` : last
    case 'harvard':
      // Harvard: Last, F.
      const harvardInitials = first.split(/\s+/).map(n => n.charAt(0).toUpperCase() + '.').join('')
      return first ? `${last}, ${harvardInitials}` : last
    default:
      return first ? `${last}, ${first}` : last
  }
}

// Generate BibTeX entry for a document
const generateBibTeXEntry = (doc) => {
  const meta = doc.metadata || {}
  const citeKey = generateCiteKey(doc)
  const authors = meta.authors || []

  // Determine entry type
  const entryType = meta.journal ? 'article' :
                    meta.booktitle ? 'inproceedings' :
                    meta.publisher ? 'book' : 'misc'

  const lines = [`@${entryType}{${citeKey},`]

  // Authors
  if (authors.length > 0) {
    const authorStr = authors.map(a => formatAuthorName(a, 'bibtex')).join(' and ')
    lines.push(`  author = {${escapeBibTeX(authorStr)}},`)
  } else {
    lines.push(`  author = {Unknown Author},`)
  }

  // Title
  const title = meta.title || doc.filename?.replace(/\.pdf$/i, '') || 'Untitled'
  lines.push(`  title = {${escapeBibTeX(title)}},`)

  // Year
  lines.push(`  year = {${meta.year || 'n.d.'}},`)

  // Journal/venue
  if (meta.journal) {
    lines.push(`  journal = {${escapeBibTeX(meta.journal)}},`)
  } else if (meta.booktitle) {
    lines.push(`  booktitle = {${escapeBibTeX(meta.booktitle)}},`)
  }

  // Volume
  if (meta.volume) {
    lines.push(`  volume = {${meta.volume}},`)
  }

  // Issue/number
  if (meta.issue) {
    lines.push(`  number = {${meta.issue}},`)
  }

  // Pages
  if (meta.pages) {
    lines.push(`  pages = {${meta.pages}},`)
  }

  // DOI
  if (meta.doi) {
    lines.push(`  doi = {${meta.doi}},`)
  }

  // Publisher
  if (meta.publisher) {
    lines.push(`  publisher = {${escapeBibTeX(meta.publisher)}},`)
  }

  // Close entry
  lines.push('}')

  return lines.join('\n')
}

// Generate RIS entry for a document
const generateRISEntry = (doc) => {
  const meta = doc.metadata || {}
  const authors = meta.authors || []

  // Determine type
  const risType = meta.journal ? 'JOUR' :
                  meta.booktitle ? 'CPAPER' :
                  meta.publisher ? 'BOOK' : 'GEN'

  const lines = [`TY  - ${risType}`]

  // Authors
  if (authors.length > 0) {
    for (const author of authors) {
      lines.push(`AU  - ${formatAuthorName(author, 'ris')}`)
    }
  } else {
    lines.push('AU  - Unknown Author')
  }

  // Title
  const title = meta.title || doc.filename?.replace(/\.pdf$/i, '') || 'Untitled'
  lines.push(`TI  - ${title}`)

  // Year
  if (meta.year) {
    lines.push(`PY  - ${meta.year}`)
  }

  // Journal
  if (meta.journal) {
    lines.push(`JO  - ${meta.journal}`)
  } else if (meta.booktitle) {
    lines.push(`T2  - ${meta.booktitle}`)
  }

  // Volume
  if (meta.volume) {
    lines.push(`VL  - ${meta.volume}`)
  }

  // Issue
  if (meta.issue) {
    lines.push(`IS  - ${meta.issue}`)
  }

  // Pages
  if (meta.pages) {
    const [start, end] = meta.pages.split(/[-–]/)
    if (start) lines.push(`SP  - ${start.trim()}`)
    if (end) lines.push(`EP  - ${end.trim()}`)
  }

  // DOI
  if (meta.doi) {
    lines.push(`DO  - ${meta.doi}`)
  }

  // Publisher
  if (meta.publisher) {
    lines.push(`PB  - ${meta.publisher}`)
  }

  // Abstract
  if (meta.abstract) {
    lines.push(`AB  - ${meta.abstract}`)
  }

  // Keywords
  if (meta.keywords && meta.keywords.length > 0) {
    for (const kw of meta.keywords) {
      lines.push(`KW  - ${kw}`)
    }
  }

  // End of record
  lines.push('ER  - ')

  return lines.join('\n')
}

// Generate CSL-JSON entry for a document
const generateCSLJSONEntry = (doc) => {
  const meta = doc.metadata || {}
  const authors = meta.authors || []
  const citeKey = generateCiteKey(doc)

  // Determine type
  const cslType = meta.journal ? 'article-journal' :
                  meta.booktitle ? 'paper-conference' :
                  meta.publisher ? 'book' : 'document'

  const entry = {
    id: citeKey,
    type: cslType,
    title: meta.title || doc.filename?.replace(/\.pdf$/i, '') || 'Untitled'
  }

  // Authors
  if (authors.length > 0) {
    entry.author = authors.map(a => ({
      family: a.last || 'Unknown',
      given: a.first || ''
    }))
  } else {
    entry.author = [{ family: 'Unknown', given: 'Author' }]
  }

  // Year
  if (meta.year) {
    entry.issued = { 'date-parts': [[parseInt(meta.year, 10)]] }
  }

  // Journal/venue
  if (meta.journal) {
    entry['container-title'] = meta.journal
  } else if (meta.booktitle) {
    entry['container-title'] = meta.booktitle
  }

  // Volume
  if (meta.volume) {
    entry.volume = String(meta.volume)
  }

  // Issue
  if (meta.issue) {
    entry.issue = String(meta.issue)
  }

  // Pages
  if (meta.pages) {
    entry.page = meta.pages
  }

  // DOI
  if (meta.doi) {
    entry.DOI = meta.doi
  }

  // Publisher
  if (meta.publisher) {
    entry.publisher = meta.publisher
  }

  // Abstract
  if (meta.abstract) {
    entry.abstract = meta.abstract
  }

  return entry
}

// Generate EndNote XML entry for a document
const generateEndNoteXMLEntry = (doc) => {
  const meta = doc.metadata || {}
  const authors = meta.authors || []

  // Determine reference type
  const refType = meta.journal ? 'Journal Article' :
                  meta.booktitle ? 'Conference Paper' :
                  meta.publisher ? 'Book' : 'Generic'

  const lines = [
    '  <record>',
    `    <ref-type name="${refType}">17</ref-type>`,
    '    <contributors>',
    '      <authors>'
  ]

  // Authors
  if (authors.length > 0) {
    for (const author of authors) {
      const name = author.first ? `${author.last}, ${author.first}` : author.last || 'Unknown'
      lines.push(`        <author><style face="normal">${escapeXML(name)}</style></author>`)
    }
  } else {
    lines.push('        <author><style face="normal">Unknown Author</style></author>')
  }

  lines.push(
    '      </authors>',
    '    </contributors>',
  )

  // Title
  const title = meta.title || doc.filename?.replace(/\.pdf$/i, '') || 'Untitled'
  lines.push(`    <titles><title><style face="normal">${escapeXML(title)}</style></title></titles>`)

  // Year
  if (meta.year) {
    lines.push(`    <dates><year>${meta.year}</year></dates>`)
  }

  // Journal
  if (meta.journal) {
    lines.push(`    <periodical><full-title>${escapeXML(meta.journal)}</full-title></periodical>`)
  }

  // Volume
  if (meta.volume) {
    lines.push(`    <volume>${meta.volume}</volume>`)
  }

  // Issue
  if (meta.issue) {
    lines.push(`    <number>${meta.issue}</number>`)
  }

  // Pages
  if (meta.pages) {
    lines.push(`    <pages>${escapeXML(meta.pages)}</pages>`)
  }

  // DOI
  if (meta.doi) {
    lines.push(`    <electronic-resource-num>${escapeXML(meta.doi)}</electronic-resource-num>`)
  }

  // Publisher
  if (meta.publisher) {
    lines.push(`    <publisher>${escapeXML(meta.publisher)}</publisher>`)
  }

  lines.push('  </record>')

  return lines.join('\n')
}

// Generate APA 7th formatted citation
const generateAPACitation = (doc) => {
  const meta = doc.metadata || {}
  const authors = meta.authors || []

  // Format authors
  let authorStr = ''
  if (authors.length === 0) {
    authorStr = 'Unknown Author'
  } else if (authors.length === 1) {
    authorStr = formatAuthorName(authors[0], 'apa')
  } else if (authors.length === 2) {
    authorStr = `${formatAuthorName(authors[0], 'apa')}, & ${formatAuthorName(authors[1], 'apa')}`
  } else if (authors.length <= 20) {
    const allButLast = authors.slice(0, -1).map(a => formatAuthorName(a, 'apa')).join(', ')
    authorStr = `${allButLast}, & ${formatAuthorName(authors[authors.length - 1], 'apa')}`
  } else {
    const first19 = authors.slice(0, 19).map(a => formatAuthorName(a, 'apa')).join(', ')
    authorStr = `${first19}, ... ${formatAuthorName(authors[authors.length - 1], 'apa')}`
  }

  // Year
  const year = meta.year ? `(${meta.year})` : '(n.d.)'

  // Title - sentence case
  const title = meta.title || doc.filename?.replace(/\.pdf$/i, '') || 'Untitled'
  const sentenceTitle = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase()

  // Build citation
  let citation = `${authorStr} ${year}. ${sentenceTitle}.`

  // Journal (italicized in actual output, we'll just add it)
  if (meta.journal) {
    citation += ` ${meta.journal}`
    if (meta.volume) {
      citation += `, ${meta.volume}`
      if (meta.issue) {
        citation += `(${meta.issue})`
      }
    }
    if (meta.pages) {
      citation += `, ${meta.pages}`
    }
    citation += '.'
  }

  // DOI
  if (meta.doi) {
    citation += ` https://doi.org/${meta.doi}`
  }

  return citation
}

// Generate MLA 9th formatted citation
const generateMLACitation = (doc) => {
  const meta = doc.metadata || {}
  const authors = meta.authors || []

  // Format authors
  let authorStr = ''
  if (authors.length === 0) {
    authorStr = 'Unknown Author'
  } else if (authors.length === 1) {
    authorStr = formatAuthorName(authors[0], 'mla')
  } else if (authors.length === 2) {
    const first = formatAuthorName(authors[0], 'mla')
    const second = authors[1].first ? `${authors[1].first} ${authors[1].last}` : authors[1].last
    authorStr = `${first}, and ${second}`
  } else {
    authorStr = `${formatAuthorName(authors[0], 'mla')}, et al.`
  }

  // Title in quotes for articles, italics for books
  const title = meta.title || doc.filename?.replace(/\.pdf$/i, '') || 'Untitled'
  const isArticle = meta.journal || meta.booktitle
  const formattedTitle = isArticle ? `"${title}"` : title

  // Build citation
  let citation = `${authorStr}. ${formattedTitle}.`

  // Container (journal)
  if (meta.journal) {
    citation += ` ${meta.journal}`
  } else if (meta.booktitle) {
    citation += ` ${meta.booktitle}`
  }

  // Volume and issue
  if (meta.volume) {
    citation += `, vol. ${meta.volume}`
    if (meta.issue) {
      citation += `, no. ${meta.issue}`
    }
  }

  // Year
  if (meta.year) {
    citation += `, ${meta.year}`
  }

  // Pages
  if (meta.pages) {
    citation += `, pp. ${meta.pages}`
  }

  citation += '.'

  // DOI
  if (meta.doi) {
    citation += ` https://doi.org/${meta.doi}.`
  }

  return citation
}

// Generate Chicago 17th formatted citation (Notes-Bibliography style)
const generateChicagoCitation = (doc) => {
  const meta = doc.metadata || {}
  const authors = meta.authors || []

  // Format authors
  let authorStr = ''
  if (authors.length === 0) {
    authorStr = 'Unknown Author'
  } else if (authors.length === 1) {
    authorStr = formatAuthorName(authors[0], 'chicago')
  } else if (authors.length === 2) {
    authorStr = `${formatAuthorName(authors[0], 'chicago')} and ${formatAuthorName(authors[1], 'chicago')}`
  } else if (authors.length === 3) {
    authorStr = `${formatAuthorName(authors[0], 'chicago')}, ${formatAuthorName(authors[1], 'chicago')}, and ${formatAuthorName(authors[2], 'chicago')}`
  } else {
    authorStr = `${formatAuthorName(authors[0], 'chicago')} et al.`
  }

  // Title in quotes for articles
  const title = meta.title || doc.filename?.replace(/\.pdf$/i, '') || 'Untitled'
  const isArticle = meta.journal || meta.booktitle
  const formattedTitle = isArticle ? `"${title}"` : title

  // Build citation
  let citation = `${authorStr}. ${formattedTitle}.`

  // Journal
  if (meta.journal) {
    citation += ` ${meta.journal}`
    if (meta.volume) {
      citation += ` ${meta.volume}`
      if (meta.issue) {
        citation += `, no. ${meta.issue}`
      }
    }
    if (meta.year) {
      citation += ` (${meta.year})`
    }
    if (meta.pages) {
      citation += `: ${meta.pages}`
    }
    citation += '.'
  } else {
    // Book style
    if (meta.publisher) {
      citation += ` ${meta.publisher}`
    }
    if (meta.year) {
      citation += `, ${meta.year}`
    }
    citation += '.'
  }

  // DOI
  if (meta.doi) {
    citation += ` https://doi.org/${meta.doi}.`
  }

  return citation
}

// Generate Harvard formatted citation
const generateHarvardCitation = (doc) => {
  const meta = doc.metadata || {}
  const authors = meta.authors || []

  // Format authors
  let authorStr = ''
  if (authors.length === 0) {
    authorStr = 'Unknown Author'
  } else if (authors.length === 1) {
    authorStr = formatAuthorName(authors[0], 'harvard')
  } else if (authors.length === 2) {
    authorStr = `${formatAuthorName(authors[0], 'harvard')} and ${formatAuthorName(authors[1], 'harvard')}`
  } else if (authors.length === 3) {
    authorStr = `${formatAuthorName(authors[0], 'harvard')}, ${formatAuthorName(authors[1], 'harvard')} and ${formatAuthorName(authors[2], 'harvard')}`
  } else {
    authorStr = `${formatAuthorName(authors[0], 'harvard')} et al.`
  }

  // Year
  const year = meta.year || 'n.d.'

  // Title
  const title = meta.title || doc.filename?.replace(/\.pdf$/i, '') || 'Untitled'

  // Build citation
  let citation = `${authorStr} (${year}) '${title}'`

  // Journal
  if (meta.journal) {
    citation += `, ${meta.journal}`
    if (meta.volume) {
      citation += `, ${meta.volume}`
      if (meta.issue) {
        citation += `(${meta.issue})`
      }
    }
    if (meta.pages) {
      citation += `, pp. ${meta.pages}`
    }
  }

  citation += '.'

  // DOI
  if (meta.doi) {
    citation += ` Available at: https://doi.org/${meta.doi}.`
  }

  return citation
}

// Main CitationExporter service
export const CitationExporter = {
  formats: [
    { id: 'bibtex', name: 'BibTeX', ext: '.bib', mime: 'application/x-bibtex' },
    { id: 'ris', name: 'RIS', ext: '.ris', mime: 'application/x-research-info-systems' },
    { id: 'csl-json', name: 'CSL-JSON', ext: '.json', mime: 'application/json' },
    { id: 'endnote', name: 'EndNote XML', ext: '.xml', mime: 'application/xml' },
    { id: 'apa', name: 'APA 7th', ext: '.txt', mime: 'text/plain' },
    { id: 'mla', name: 'MLA 9th', ext: '.txt', mime: 'text/plain' },
    { id: 'chicago', name: 'Chicago 17th', ext: '.txt', mime: 'text/plain' },
    { id: 'harvard', name: 'Harvard', ext: '.txt', mime: 'text/plain' }
  ],

  /**
   * Generate BibTeX for multiple documents
   */
  generateBibTeX(documents) {
    if (!documents || documents.length === 0) return ''
    return documents.map(doc => generateBibTeXEntry(doc)).join('\n\n')
  },

  /**
   * Generate RIS for multiple documents
   */
  generateRIS(documents) {
    if (!documents || documents.length === 0) return ''
    return documents.map(doc => generateRISEntry(doc)).join('\n\n')
  },

  /**
   * Generate CSL-JSON for multiple documents
   */
  generateCSLJSON(documents) {
    if (!documents || documents.length === 0) return '[]'
    const entries = documents.map(doc => generateCSLJSONEntry(doc))
    return JSON.stringify(entries, null, 2)
  },

  /**
   * Generate EndNote XML for multiple documents
   */
  generateEndNoteXML(documents) {
    if (!documents || documents.length === 0) {
      return '<?xml version="1.0" encoding="UTF-8"?>\n<xml><records></records></xml>'
    }

    const entries = documents.map(doc => generateEndNoteXMLEntry(doc)).join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<xml>\n<records>\n${entries}\n</records>\n</xml>`
  },

  /**
   * Generate formatted citations in specified style
   */
  generateFormattedCitations(documents, style = 'apa') {
    if (!documents || documents.length === 0) return ''

    const generators = {
      apa: generateAPACitation,
      mla: generateMLACitation,
      chicago: generateChicagoCitation,
      harvard: generateHarvardCitation
    }

    const generator = generators[style]
    if (!generator) {
      throw new Error(`Unknown citation style: ${style}`)
    }

    return documents.map(doc => generator(doc)).join('\n\n')
  },

  /**
   * Get citation content for preview
   */
  getContent(documents, format) {
    switch (format) {
      case 'bibtex':
        return this.generateBibTeX(documents)
      case 'ris':
        return this.generateRIS(documents)
      case 'csl-json':
        return this.generateCSLJSON(documents)
      case 'endnote':
        return this.generateEndNoteXML(documents)
      case 'apa':
        return this.generateFormattedCitations(documents, 'apa')
      case 'mla':
        return this.generateFormattedCitations(documents, 'mla')
      case 'chicago':
        return this.generateFormattedCitations(documents, 'chicago')
      case 'harvard':
        return this.generateFormattedCitations(documents, 'harvard')
      default:
        throw new Error(`Unknown format: ${format}`)
    }
  },

  /**
   * Get file extension for format
   */
  getExtension(format) {
    const fmt = this.formats.find(f => f.id === format)
    return fmt ? fmt.ext : '.txt'
  },

  /**
   * Get MIME type for format
   */
  getMimeType(format) {
    const fmt = this.formats.find(f => f.id === format)
    return fmt ? fmt.mime : 'text/plain'
  },

  /**
   * Trigger file download
   */
  export(documents, format, filename = 'citations') {
    const content = this.getContent(documents, format)
    const ext = this.getExtension(format)
    const mimeType = this.getMimeType(format)

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}${ext}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  },

  /**
   * Copy citation content to clipboard
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      return { success: true }
    } catch (error) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()

      try {
        document.execCommand('copy')
        document.body.removeChild(textarea)
        return { success: true }
      } catch (e) {
        document.body.removeChild(textarea)
        return { success: false, error: e.message }
      }
    }
  }
}

export default CitationExporter
