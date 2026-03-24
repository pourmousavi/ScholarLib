/**
 * AnnotationExporter - Export annotations in various formats
 */

/**
 * Export annotations as markdown
 * @param {Array} annotations - Annotations to export
 * @param {Object} options - Export options
 * @param {Object} options.document - Document metadata
 * @param {boolean} options.includeTimestamps - Include creation dates
 * @param {boolean} options.groupByPage - Group annotations by page
 * @returns {string} Markdown formatted annotations
 */
export function exportToMarkdown(annotations, options = {}) {
  const {
    document,
    includeTimestamps = true,
    groupByPage = true
  } = options

  if (!annotations || annotations.length === 0) {
    return ''
  }

  const lines = []

  // Document header
  if (document?.metadata?.title) {
    lines.push(`# Annotations: ${document.metadata.title}`)
    lines.push('')

    if (document.metadata.authors?.length > 0) {
      const authors = document.metadata.authors
        .map(a => `${a.first || ''} ${a.last || ''}`.trim())
        .join(', ')
      lines.push(`**Authors:** ${authors}`)
    }

    if (document.metadata.year) {
      lines.push(`**Year:** ${document.metadata.year}`)
    }

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // Sort annotations by page
  const sortedAnnotations = [...annotations].sort((a, b) => {
    const pageA = a.position?.page || 0
    const pageB = b.position?.page || 0
    if (pageA !== pageB) return pageA - pageB
    return (a.position?.boundingRect?.y1 || 0) - (b.position?.boundingRect?.y1 || 0)
  })

  if (groupByPage) {
    // Group by page
    const byPage = {}
    for (const ann of sortedAnnotations) {
      const page = ann.position?.page || 'Unknown'
      if (!byPage[page]) byPage[page] = []
      byPage[page].push(ann)
    }

    for (const [page, pageAnnotations] of Object.entries(byPage)) {
      lines.push(`## Page ${page}`)
      lines.push('')

      for (const ann of pageAnnotations) {
        lines.push(formatAnnotation(ann, includeTimestamps))
        lines.push('')
      }
    }
  } else {
    // Flat list
    for (const ann of sortedAnnotations) {
      lines.push(formatAnnotation(ann, includeTimestamps))
      lines.push('')
    }
  }

  // Footer
  lines.push('---')
  lines.push(`*Exported from ScholarLib on ${new Date().toLocaleDateString()}*`)

  return lines.join('\n')
}

/**
 * Format a single annotation for markdown
 * @param {Object} annotation
 * @param {boolean} includeTimestamp
 * @returns {string}
 */
function formatAnnotation(annotation, includeTimestamp = true) {
  const lines = []
  const { type, color, content, comment, created_at, tags } = annotation

  // Type indicator
  const typeIcon = getTypeIcon(type)

  // Highlighted text as blockquote
  if (content?.text) {
    lines.push(`${typeIcon} **Highlight:**`)
    lines.push('')
    lines.push(`> ${content.text.replace(/\n/g, '\n> ')}`)
    lines.push('')
  }

  // Image reference for area annotations
  if (type === 'area' && content?.image) {
    lines.push(`${typeIcon} **Area Selection** (image captured)`)
    lines.push('')
  }

  // User comment
  if (comment) {
    lines.push('**Note:**')
    lines.push(comment)
    lines.push('')
  }

  // Metadata footer
  const metaParts = []

  if (includeTimestamp && created_at) {
    const date = new Date(created_at).toLocaleDateString()
    metaParts.push(`Created: ${date}`)
  }

  if (tags && tags.length > 0) {
    metaParts.push(`Tags: ${tags.join(', ')}`)
  }

  // Color indicator
  const colorName = getColorName(color)
  if (colorName) {
    metaParts.push(`Color: ${colorName}`)
  }

  if (metaParts.length > 0) {
    lines.push(`*${metaParts.join(' | ')}*`)
  }

  return lines.join('\n')
}

/**
 * Get icon/emoji for annotation type
 * @param {string} type
 * @returns {string}
 */
function getTypeIcon(type) {
  switch (type) {
    case 'highlight':
      return '🖍️'
    case 'underline':
      return '➖'
    case 'area':
      return '📷'
    case 'note':
      return '📝'
    default:
      return '•'
  }
}

/**
 * Get color name from hex
 * @param {string} hex
 * @returns {string}
 */
function getColorName(hex) {
  const colors = {
    '#FFEB3B': 'Yellow',
    '#F44336': 'Red',
    '#4CAF50': 'Green',
    '#2196F3': 'Blue',
    '#9C27B0': 'Purple',
    '#FF9800': 'Orange',
    '#9E9E9E': 'Gray',
    '#00BCD4': 'Cyan'
  }
  return colors[hex] || null
}

/**
 * Export annotations for note integration
 * Returns a simpler format suitable for embedding in notes
 * @param {Array} annotations
 * @returns {string}
 */
export function exportForNotes(annotations) {
  if (!annotations || annotations.length === 0) {
    return ''
  }

  const lines = ['## Highlights & Annotations', '']

  const sortedAnnotations = [...annotations].sort((a, b) => {
    return (a.position?.page || 0) - (b.position?.page || 0)
  })

  for (const ann of sortedAnnotations) {
    const page = ann.position?.page || '?'

    if (ann.content?.text) {
      lines.push(`> "${ann.content.text}" *(p. ${page})*`)

      if (ann.comment) {
        lines.push('')
        lines.push(`  → ${ann.comment}`)
      }

      lines.push('')
    } else if (ann.comment) {
      lines.push(`**Note (p. ${page}):** ${ann.comment}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Export annotations as JSON (for backup/transfer)
 * @param {Array} annotations
 * @param {Object} document - Document metadata
 * @returns {string} JSON string
 */
export function exportToJSON(annotations, document = null) {
  const data = {
    exported_at: new Date().toISOString(),
    document: document ? {
      title: document.metadata?.title,
      authors: document.metadata?.authors,
      doi: document.metadata?.doi,
      year: document.metadata?.year
    } : null,
    annotations: annotations
  }

  return JSON.stringify(data, null, 2)
}

/**
 * Get annotation statistics
 * @param {Array} annotations
 * @returns {Object}
 */
export function getAnnotationStats(annotations) {
  if (!annotations || annotations.length === 0) {
    return {
      total: 0,
      byType: {},
      byColor: {},
      withComments: 0,
      pages: 0
    }
  }

  const stats = {
    total: annotations.length,
    byType: {},
    byColor: {},
    withComments: 0,
    pages: new Set()
  }

  for (const ann of annotations) {
    // Count by type
    stats.byType[ann.type] = (stats.byType[ann.type] || 0) + 1

    // Count by color
    const colorName = getColorName(ann.color) || 'Other'
    stats.byColor[colorName] = (stats.byColor[colorName] || 0) + 1

    // Count with comments
    if (ann.comment) {
      stats.withComments++
    }

    // Track unique pages
    if (ann.position?.page) {
      stats.pages.add(ann.position.page)
    }
  }

  stats.pages = stats.pages.size

  return stats
}
