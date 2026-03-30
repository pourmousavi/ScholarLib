/**
 * PDFAnnotationExtractor - Extract annotations embedded in PDF files
 *
 * Uses PDF.js to read annotation data that Zotero embeds when exporting.
 * Converts PDF annotations to ScholarLib annotation format.
 */
import * as pdfjsLib from 'pdfjs-dist'

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

/**
 * Extract annotations from a PDF file
 * @param {Blob|ArrayBuffer|string} pdfSource - PDF as Blob, ArrayBuffer, or URL
 * @param {Function} onProgress - Progress callback (page, totalPages)
 * @returns {Promise<Array>} Array of annotation objects
 */
export async function extractPDFAnnotations(pdfSource, onProgress) {
  const annotations = []

  try {
    // Load PDF
    let data
    if (pdfSource instanceof Blob) {
      data = await pdfSource.arrayBuffer()
    } else {
      data = pdfSource
    }

    const pdf = await pdfjsLib.getDocument(data).promise

    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      onProgress?.(pageNum, pdf.numPages)

      const page = await pdf.getPage(pageNum)
      const pageAnnotations = await page.getAnnotations()

      // Get page dimensions for coordinate conversion
      const viewport = page.getViewport({ scale: 1 })

      for (const pdfAnnotation of pageAnnotations) {
        const converted = convertPDFAnnotation(pdfAnnotation, pageNum, viewport)
        if (converted) {
          annotations.push(converted)
        }
      }
    }

    // Clean up
    await pdf.destroy()

    return annotations
  } catch (error) {
    console.error('Failed to extract PDF annotations:', error)
    throw error
  }
}

/**
 * Convert PDF.js annotation to ScholarLib format
 * @param {Object} pdfAnnotation - PDF.js annotation object
 * @param {number} pageNum - Page number (1-indexed from PDF.js)
 * @param {Object} viewport - Page viewport for coordinate conversion
 * @returns {Object|null} ScholarLib annotation or null if not supported
 */
function convertPDFAnnotation(pdfAnnotation, pageNum, viewport) {
  // Convert to 0-indexed page for EmbedPDF compatibility
  const pageIndex = pageNum - 1
  const { subtype, rect, quadPoints, color, contents, title, modificationDate, inkLists, borderStyle } = pdfAnnotation

  // Only process highlight, underline, squiggly, strikeout, text, ink, and area annotations
  const supportedTypes = ['Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Text', 'FreeText', 'Ink', 'Square', 'Circle']
  if (!supportedTypes.includes(subtype)) {
    return null
  }

  // Map PDF annotation type to ScholarLib type
  const typeMapping = {
    'Highlight': 'highlight',
    'Underline': 'underline',
    'Squiggly': 'underline',
    'StrikeOut': 'highlight',
    'Text': 'note',
    'FreeText': 'note',
    'Ink': 'ink',
    'Square': 'area',
    'Circle': 'area'
  }

  const type = typeMapping[subtype]

  // Convert coordinates
  const rects = convertCoordinates(rect, quadPoints, viewport)

  // Convert color from RGB array to hex
  const hexColor = color ? rgbToHex(color) : '#FFEB3B'

  // Parse modification date
  const timestamp = modificationDate
    ? parsePDFDate(modificationDate)
    : new Date().toISOString()

  // Get text content (may be empty for highlights without extracted text)
  const text = contents || ''

  // Handle ink paths for ink annotations
  let paths = null
  let strokeWidth = 2
  if (subtype === 'Ink' && inkLists) {
    paths = convertInkPaths(inkLists, viewport)
    strokeWidth = borderStyle?.width || 2
  }

  const annotation = {
    type,
    color: hexColor,
    created_at: timestamp,
    updated_at: timestamp,
    position: {
      page: pageIndex, // 0-indexed for EmbedPDF compatibility
      rects,
      boundingRect: calculateBoundingRect(rects)
    },
    content: {
      text: text,
      image: null
    },
    comment: subtype === 'Text' || subtype === 'FreeText' ? contents : '',
    tags: [],
    ai_context: {
      include_in_embeddings: true
    },
    source: 'pdf_import'
  }

  // Add ink-specific properties
  if (paths) {
    annotation.position.paths = paths
    annotation.strokeWidth = strokeWidth
  }

  return annotation
}

/**
 * Convert PDF coordinates to ScholarLib format
 * PDF uses bottom-left origin, we use top-left
 * @param {Array} rect - Bounding rectangle [x1, y1, x2, y2]
 * @param {Array} quadPoints - Array of quad point coordinates
 * @param {Object} viewport - Page viewport
 * @returns {Array} Array of rect objects
 */
function convertCoordinates(rect, quadPoints, viewport) {
  const pageHeight = viewport.height

  // If we have quadPoints, use them for precise highlight regions
  if (quadPoints && quadPoints.length >= 8) {
    const rects = []

    // quadPoints are in groups of 8 (4 corners x 2 coordinates)
    for (let i = 0; i < quadPoints.length; i += 8) {
      // Quad points are: [x1,y1, x2,y2, x3,y3, x4,y4]
      // representing corners in order: TL, TR, BL, BR (or similar)
      const x1 = Math.min(quadPoints[i], quadPoints[i + 2], quadPoints[i + 4], quadPoints[i + 6])
      const x2 = Math.max(quadPoints[i], quadPoints[i + 2], quadPoints[i + 4], quadPoints[i + 6])
      const y1 = Math.min(quadPoints[i + 1], quadPoints[i + 3], quadPoints[i + 5], quadPoints[i + 7])
      const y2 = Math.max(quadPoints[i + 1], quadPoints[i + 3], quadPoints[i + 5], quadPoints[i + 7])

      // Convert from PDF coordinates (origin bottom-left) to screen coordinates (origin top-left)
      rects.push({
        x1: x1,
        y1: pageHeight - y2,
        x2: x2,
        y2: pageHeight - y1
      })
    }

    return rects
  }

  // Fall back to bounding rect
  if (rect && rect.length >= 4) {
    return [{
      x1: rect[0],
      y1: pageHeight - rect[3],
      x2: rect[2],
      y2: pageHeight - rect[1]
    }]
  }

  return []
}

/**
 * Convert PDF ink paths to ScholarLib format
 * @param {Array} inkLists - Array of ink paths from PDF.js
 * @param {Object} viewport - Page viewport
 * @returns {Array} Array of path arrays
 */
function convertInkPaths(inkLists, viewport) {
  const pageHeight = viewport.height

  return inkLists.map(inkList => {
    const points = []
    // inkList is a flat array [x1, y1, x2, y2, ...]
    for (let i = 0; i < inkList.length; i += 2) {
      points.push({
        x: inkList[i],
        y: pageHeight - inkList[i + 1] // Convert PDF coords to screen coords
      })
    }
    return points
  })
}

/**
 * Calculate bounding rect from array of rects
 * @param {Array} rects
 * @returns {Object}
 */
function calculateBoundingRect(rects) {
  if (rects.length === 0) {
    return { x1: 0, y1: 0, x2: 0, y2: 0 }
  }

  return rects.reduce((bounds, rect) => ({
    x1: Math.min(bounds.x1, rect.x1),
    y1: Math.min(bounds.y1, rect.y1),
    x2: Math.max(bounds.x2, rect.x2),
    y2: Math.max(bounds.y2, rect.y2)
  }), {
    x1: Infinity,
    y1: Infinity,
    x2: -Infinity,
    y2: -Infinity
  })
}

/**
 * Convert RGB array to hex color
 * @param {Array} rgb - Array of [r, g, b] values (0-255 or 0-1)
 * @returns {string} Hex color string
 */
function rgbToHex(rgb) {
  if (!rgb || rgb.length < 3) return '#FFEB3B'

  // Check if values are 0-1 or 0-255
  const isNormalized = rgb[0] <= 1 && rgb[1] <= 1 && rgb[2] <= 1

  const r = isNormalized ? Math.round(rgb[0] * 255) : rgb[0]
  const g = isNormalized ? Math.round(rgb[1] * 255) : rgb[1]
  const b = isNormalized ? Math.round(rgb[2] * 255) : rgb[2]

  return '#' + [r, g, b].map(c =>
    Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')
  ).join('').toUpperCase()
}

/**
 * Parse PDF date string
 * PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm'
 * @param {string} pdfDate
 * @returns {string} ISO 8601 date string
 */
function parsePDFDate(pdfDate) {
  if (!pdfDate) return new Date().toISOString()

  try {
    // Remove 'D:' prefix if present
    let dateStr = pdfDate.replace(/^D:/, '')

    // Extract components
    const year = dateStr.substring(0, 4)
    const month = dateStr.substring(4, 6) || '01'
    const day = dateStr.substring(6, 8) || '01'
    const hour = dateStr.substring(8, 10) || '00'
    const minute = dateStr.substring(10, 12) || '00'
    const second = dateStr.substring(12, 14) || '00'

    // Parse timezone offset
    let tzOffset = '+00:00'
    const tzMatch = dateStr.match(/([+-])(\d{2})'?(\d{2})?'?$/)
    if (tzMatch) {
      tzOffset = `${tzMatch[1]}${tzMatch[2]}:${tzMatch[3] || '00'}`
    } else if (dateStr.includes('Z')) {
      tzOffset = 'Z'
    }

    const isoDate = `${year}-${month}-${day}T${hour}:${minute}:${second}${tzOffset}`
    return new Date(isoDate).toISOString()
  } catch (e) {
    return new Date().toISOString()
  }
}

/**
 * Extract highlighted text from PDF
 * Attempts to extract the actual text content under highlight annotations
 * @param {Blob|ArrayBuffer|string} pdfSource
 * @param {Array} annotations - Annotations with positions
 * @returns {Promise<Array>} Annotations with extracted text
 */
export async function extractHighlightedText(pdfSource, annotations) {
  try {
    let data
    if (pdfSource instanceof Blob) {
      data = await pdfSource.arrayBuffer()
    } else {
      data = pdfSource
    }

    const pdf = await pdfjsLib.getDocument(data).promise

    // Group annotations by page (0-indexed)
    const byPage = {}
    for (const ann of annotations) {
      const pageIndex = ann.position?.page
      if (pageIndex !== undefined && pageIndex !== null) {
        if (!byPage[pageIndex]) byPage[pageIndex] = []
        byPage[pageIndex].push(ann)
      }
    }

    // Process each page with annotations
    for (const [pageIndexStr, pageAnnotations] of Object.entries(byPage)) {
      const pageIndex = parseInt(pageIndexStr)
      // PDF.js getPage is 1-indexed, our page indices are 0-indexed
      const page = await pdf.getPage(pageIndex + 1)
      const textContent = await page.getTextContent()
      const viewport = page.getViewport({ scale: 1 })

      for (const ann of pageAnnotations) {
        if (ann.type === 'highlight' && !ann.content?.text) {
          const text = extractTextInRegion(textContent, ann.position.rects, viewport.height)
          if (text) {
            ann.content = { ...ann.content, text }
          }
        }
      }
    }

    await pdf.destroy()
    return annotations
  } catch (error) {
    console.error('Failed to extract highlighted text:', error)
    return annotations
  }
}

/**
 * Extract text items that fall within annotation rects
 * @param {Object} textContent - PDF.js text content
 * @param {Array} rects - Annotation rectangles
 * @param {number} pageHeight - Page height for coordinate conversion
 * @returns {string} Extracted text
 */
function extractTextInRegion(textContent, rects, pageHeight) {
  const textItems = []

  for (const item of textContent.items) {
    const { str, transform } = item

    // Get text position from transform matrix
    // transform is [scaleX, skewY, skewX, scaleY, translateX, translateY]
    const x = transform[4]
    const y = pageHeight - transform[5]

    // Check if this text item overlaps with any rect
    for (const rect of rects) {
      if (x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2) {
        textItems.push({ text: str, x, y })
        break
      }
    }
  }

  // Sort by position (top to bottom, left to right)
  textItems.sort((a, b) => {
    const yDiff = a.y - b.y
    if (Math.abs(yDiff) > 5) return yDiff
    return a.x - b.x
  })

  return textItems.map(t => t.text).join(' ').trim()
}
