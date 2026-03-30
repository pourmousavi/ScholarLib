/**
 * AnnotationAdapter - Bidirectional conversion between ScholarLib and EmbedPDF annotation formats
 *
 * ScholarLib Format:
 * {
 *   id: "ann_xxx",
 *   type: "highlight" | "underline" | "area" | "note" | "ink",
 *   color: "#FFEB3B",
 *   position: {
 *     page: 0,  // 0-indexed
 *     rects: [{ x1, y1, x2, y2 }],
 *     boundingRect: { x1, y1, x2, y2 },
 *     paths: [[{x, y}, ...]]  // For ink annotations
 *   },
 *   content: { text: "...", image: null },
 *   comment: "User note",
 *   tags: ["tag1"],
 *   ai_context: { include_in_embeddings: true },
 *   strokeWidth: 2,  // For ink annotations
 *   created_at: "ISO date",
 *   updated_at: "ISO date",
 *   source: "user" | "pdf_import" | "zotero"
 * }
 *
 * EmbedPDF Format (approximate):
 * {
 *   id: "uuid",
 *   type: "highlight" | "underline" | "strikeout" | "ink" | "square" | "circle" | "freetext",
 *   pageIndex: 0,
 *   color: { r: 255, g: 235, b: 59, a: 0.35 },
 *   quadPoints: [...],  // For text markup
 *   rect: { x1, y1, x2, y2 },  // For area annotations
 *   paths: [[{x, y}, ...]],  // For ink
 *   contents: "comment text",
 *   createdDate: Date,
 *   modifiedDate: Date
 * }
 */

import { ANNOTATION_COLORS, DEFAULT_HIGHLIGHT_COLOR } from './AnnotationService'

/**
 * Convert hex color to RGBA object (EmbedPDF format)
 * @param {string} hex - Hex color string (e.g., "#FFEB3B")
 * @param {number} alpha - Alpha value (0-1)
 * @returns {Object} { r, g, b, a }
 */
export function hexToRgba(hex, alpha = 0.35) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) {
    return { r: 255, g: 235, b: 59, a: alpha }
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: alpha
  }
}

/**
 * Convert RGBA object to hex color string
 * @param {Object} rgba - { r, g, b, a }
 * @returns {string} Hex color string
 */
export function rgbaToHex(rgba) {
  if (!rgba) return DEFAULT_HIGHLIGHT_COLOR
  const r = Math.round(rgba.r).toString(16).padStart(2, '0')
  const g = Math.round(rgba.g).toString(16).padStart(2, '0')
  const b = Math.round(rgba.b).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`.toUpperCase()
}

/**
 * Map ScholarLib annotation type to EmbedPDF type
 */
const TYPE_TO_EMBEDPDF = {
  highlight: 'highlight',
  underline: 'underline',
  strikethrough: 'strikeout',
  area: 'square',
  note: 'freetext',
  ink: 'ink'
}

/**
 * Map EmbedPDF annotation type to ScholarLib type
 */
const TYPE_FROM_EMBEDPDF = {
  highlight: 'highlight',
  underline: 'underline',
  strikeout: 'strikethrough',
  squiggly: 'underline',
  square: 'area',
  circle: 'area',
  freetext: 'note',
  ink: 'ink',
  inkHighlighter: 'ink'
}

/**
 * Convert ScholarLib rects to EmbedPDF quadPoints
 * QuadPoints format: array of 8 numbers per quad [x1,y1, x2,y2, x3,y3, x4,y4]
 * representing corners: bottom-left, bottom-right, top-right, top-left
 */
function rectsToQuadPoints(rects) {
  if (!rects || rects.length === 0) return []

  return rects.map(rect => [
    rect.x1, rect.y2,  // bottom-left
    rect.x2, rect.y2,  // bottom-right
    rect.x2, rect.y1,  // top-right
    rect.x1, rect.y1   // top-left
  ])
}

/**
 * Convert EmbedPDF quadPoints to ScholarLib rects
 */
function quadPointsToRects(quadPoints) {
  if (!quadPoints || quadPoints.length === 0) return []

  return quadPoints.map(quad => {
    // quad is [blX, blY, brX, brY, trX, trY, tlX, tlY]
    const blX = quad[0], blY = quad[1]
    const brX = quad[2]
    const trX = quad[4], trY = quad[5]
    const tlY = quad[7]

    return {
      x1: Math.min(blX, quad[6]),
      y1: Math.min(trY, tlY),
      x2: Math.max(brX, trX),
      y2: Math.max(blY, quad[3])
    }
  })
}

/**
 * Map ScholarLib type to EmbedPDF annotation subtype enum
 */
const TYPE_TO_EMBEDPDF_ENUM = {
  highlight: 9,    // PdfAnnotationSubtype.HIGHLIGHT
  underline: 10,   // PdfAnnotationSubtype.UNDERLINE
  strikethrough: 12, // PdfAnnotationSubtype.STRIKEOUT
  area: 4,         // PdfAnnotationSubtype.SQUARE
  note: 2,         // PdfAnnotationSubtype.FREETEXT
  ink: 15          // PdfAnnotationSubtype.INK
}

/**
 * Convert ScholarLib annotation to EmbedPDF format
 * @param {Object} annotation - ScholarLib annotation
 * @returns {Object} EmbedPDF annotation
 */
export function toEmbedPDF(annotation) {
  // Use numeric type for EmbedPDF
  const embedType = TYPE_TO_EMBEDPDF_ENUM[annotation.type] || 9

  const base = {
    id: annotation.id,
    type: embedType,
    pageIndex: annotation.position?.page ?? 0,
    strokeColor: annotation.color || DEFAULT_HIGHLIGHT_COLOR,
    opacity: 0.35,
    contents: annotation.comment || annotation.content?.text || '',
    created: annotation.created_at ? new Date(annotation.created_at) : new Date(),
    modified: annotation.updated_at ? new Date(annotation.updated_at) : new Date(),
    // Store ScholarLib metadata as custom properties
    _scholarlib: {
      tags: annotation.tags,
      ai_context: annotation.ai_context,
      source: annotation.source,
      content: annotation.content
    }
  }

  // Add type-specific properties
  if (annotation.type === 'highlight' || annotation.type === 'underline' || annotation.type === 'strikethrough') {
    // Convert rects to EmbedPDF segmentRects format
    const rects = annotation.position?.rects || []
    base.segmentRects = rects.map(rect => ({
      origin: { x: rect.x1, y: rect.y1 },
      size: { width: rect.x2 - rect.x1, height: rect.y2 - rect.y1 }
    }))

    // Also include bounding rect
    if (annotation.position?.boundingRect) {
      const br = annotation.position.boundingRect
      base.rect = {
        origin: { x: br.x1, y: br.y1 },
        size: { width: br.x2 - br.x1, height: br.y2 - br.y1 }
      }
    } else if (rects.length > 0) {
      const bounds = calculateBoundingRect(rects)
      base.rect = {
        origin: { x: bounds.x1, y: bounds.y1 },
        size: { width: bounds.x2 - bounds.x1, height: bounds.y2 - bounds.y1 }
      }
    }
  } else if (annotation.type === 'area') {
    const rect = annotation.position?.boundingRect || annotation.position?.rects?.[0]
    if (rect) {
      base.rect = {
        origin: { x: rect.x1, y: rect.y1 },
        size: { width: rect.x2 - rect.x1, height: rect.y2 - rect.y1 }
      }
    }
  } else if (annotation.type === 'ink') {
    base.paths = annotation.position?.paths || []
    base.strokeWidth = annotation.strokeWidth || 2
  } else if (annotation.type === 'note') {
    const rect = annotation.position?.boundingRect
    if (rect) {
      base.rect = {
        origin: { x: rect.x1, y: rect.y1 },
        size: { width: rect.x2 - rect.x1, height: rect.y2 - rect.y1 }
      }
    }
    base.contents = annotation.comment || annotation.content?.text || ''
  }

  return base
}

/**
 * Convert EmbedPDF annotation to ScholarLib format
 * @param {Object} embedAnnotation - EmbedPDF annotation
 * @returns {Object} ScholarLib annotation
 */
export function fromEmbedPDF(embedAnnotation) {
  // Handle numeric type (EmbedPDF uses enum values like 9 for HIGHLIGHT)
  let scholarType = 'highlight'
  if (typeof embedAnnotation.type === 'number') {
    // PdfAnnotationSubtype enum values
    const typeMap = {
      9: 'highlight',   // HIGHLIGHT
      10: 'underline',  // UNDERLINE
      11: 'underline',  // SQUIGGLY
      12: 'strikethrough', // STRIKEOUT
      4: 'area',        // SQUARE
      5: 'area',        // CIRCLE
      2: 'note',        // FREETEXT
      15: 'ink'         // INK
    }
    scholarType = typeMap[embedAnnotation.type] || 'highlight'
  } else {
    scholarType = TYPE_FROM_EMBEDPDF[embedAnnotation.type] || 'highlight'
  }

  // Handle color - EmbedPDF uses strokeColor for text markup, color for others
  const colorSource = embedAnnotation.strokeColor || embedAnnotation.color
  let color = DEFAULT_HIGHLIGHT_COLOR
  if (typeof colorSource === 'string') {
    // Already a hex color
    color = colorSource
  } else if (colorSource && typeof colorSource === 'object') {
    color = rgbaToHex(colorSource)
  }

  // Extract custom metadata if present
  const metadata = embedAnnotation._scholarlib || {}

  // Handle dates - EmbedPDF uses created/modified, not createdDate/modifiedDate
  const createdAt = embedAnnotation.created?.toISOString?.() ||
    embedAnnotation.createdDate?.toISOString?.() ||
    new Date().toISOString()
  const updatedAt = embedAnnotation.modified?.toISOString?.() ||
    embedAnnotation.modifiedDate?.toISOString?.() ||
    new Date().toISOString()

  const base = {
    id: embedAnnotation.id,
    type: scholarType,
    color,
    created_at: createdAt,
    updated_at: updatedAt,
    position: {
      page: embedAnnotation.pageIndex ?? 0,
      rects: [],
      boundingRect: null,
      paths: null
    },
    content: metadata.content || { text: embedAnnotation.contents || '', image: null },
    comment: embedAnnotation.contents || '',
    tags: metadata.tags || [],
    ai_context: metadata.ai_context || { include_in_embeddings: true },
    source: metadata.source || 'embedpdf'
  }

  // Add type-specific position data
  // EmbedPDF uses segmentRects for text markup (highlight, underline, etc.)
  if (embedAnnotation.segmentRects && embedAnnotation.segmentRects.length > 0) {
    base.position.rects = embedAnnotation.segmentRects.map(rect => {
      // Handle { origin: { x, y }, size: { width, height } } format
      if (rect.origin && rect.size) {
        return {
          x1: rect.origin.x,
          y1: rect.origin.y,
          x2: rect.origin.x + rect.size.width,
          y2: rect.origin.y + rect.size.height
        }
      }
      // Handle { x1, y1, x2, y2 } format
      return rect
    })
    base.position.boundingRect = calculateBoundingRect(base.position.rects)
  } else if (embedAnnotation.quadPoints) {
    base.position.rects = quadPointsToRects(embedAnnotation.quadPoints)
    if (base.position.rects.length > 0) {
      base.position.boundingRect = calculateBoundingRect(base.position.rects)
    }
  } else if (embedAnnotation.rect) {
    // Handle { origin: { x, y }, size: { width, height } } format
    let rectObj
    if (embedAnnotation.rect.origin && embedAnnotation.rect.size) {
      rectObj = {
        x1: embedAnnotation.rect.origin.x,
        y1: embedAnnotation.rect.origin.y,
        x2: embedAnnotation.rect.origin.x + embedAnnotation.rect.size.width,
        y2: embedAnnotation.rect.origin.y + embedAnnotation.rect.size.height
      }
    } else {
      rectObj = {
        x1: embedAnnotation.rect.x1,
        y1: embedAnnotation.rect.y1,
        x2: embedAnnotation.rect.x2,
        y2: embedAnnotation.rect.y2
      }
    }
    base.position.rects = [rectObj]
    base.position.boundingRect = rectObj
  }

  if (embedAnnotation.paths) {
    base.position.paths = embedAnnotation.paths
    base.strokeWidth = embedAnnotation.strokeWidth || 2
  }

  return base
}

/**
 * Calculate bounding rect from array of rects
 */
function calculateBoundingRect(rects) {
  if (!rects || rects.length === 0) return null

  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity

  for (const rect of rects) {
    x1 = Math.min(x1, rect.x1)
    y1 = Math.min(y1, rect.y1)
    x2 = Math.max(x2, rect.x2)
    y2 = Math.max(y2, rect.y2)
  }

  return { x1, y1, x2, y2 }
}

/**
 * Convert an array of ScholarLib annotations to EmbedPDF format
 * @param {Array} annotations - Array of ScholarLib annotations
 * @returns {Array} Array of EmbedPDF annotations
 */
export function toEmbedPDFArray(annotations) {
  if (!annotations || !Array.isArray(annotations)) return []
  return annotations.map(toEmbedPDF)
}

/**
 * Convert an array of EmbedPDF annotations to ScholarLib format
 * @param {Array} embedAnnotations - Array of EmbedPDF annotations
 * @returns {Array} Array of ScholarLib annotations
 */
export function fromEmbedPDFArray(embedAnnotations) {
  if (!embedAnnotations || !Array.isArray(embedAnnotations)) return []
  return embedAnnotations.map(fromEmbedPDF)
}

/**
 * Convert EmbedPDF annotation event to ScholarLib update
 * @param {Object} event - EmbedPDF annotation event
 * @returns {Object} { type, annotation, patch }
 */
export function fromEmbedPDFEvent(event) {
  const result = {
    type: event.type, // 'create', 'update', 'delete'
    annotation: null,
    patch: null
  }

  if (event.annotation) {
    result.annotation = fromEmbedPDF(event.annotation)
  }

  if (event.patch) {
    // Convert patch properties
    const patch = {}
    if (event.patch.color) {
      patch.color = rgbaToHex(event.patch.color)
    }
    if (event.patch.contents !== undefined) {
      patch.comment = event.patch.contents
    }
    if (event.patch.rect) {
      patch.position = {
        rects: [{
          x1: event.patch.rect.x1,
          y1: event.patch.rect.y1,
          x2: event.patch.rect.x2,
          y2: event.patch.rect.y2
        }],
        boundingRect: { ...event.patch.rect }
      }
    }
    result.patch = patch
  }

  return result
}

export const AnnotationAdapter = {
  toEmbedPDF,
  fromEmbedPDF,
  toEmbedPDFArray,
  fromEmbedPDFArray,
  fromEmbedPDFEvent,
  hexToRgba,
  rgbaToHex
}
