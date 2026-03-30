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
 * Convert ScholarLib annotation to EmbedPDF format
 * @param {Object} annotation - ScholarLib annotation
 * @returns {Object} EmbedPDF annotation
 */
export function toEmbedPDF(annotation) {
  const embedType = TYPE_TO_EMBEDPDF[annotation.type] || 'highlight'
  const color = hexToRgba(annotation.color || DEFAULT_HIGHLIGHT_COLOR)

  const base = {
    id: annotation.id,
    type: embedType,
    pageIndex: annotation.position?.page ?? 0,
    color,
    contents: annotation.comment || '',
    createdDate: annotation.created_at ? new Date(annotation.created_at) : new Date(),
    modifiedDate: annotation.updated_at ? new Date(annotation.updated_at) : new Date(),
    // Store ScholarLib metadata as custom properties
    _scholarlib: {
      tags: annotation.tags,
      ai_context: annotation.ai_context,
      source: annotation.source,
      content: annotation.content
    }
  }

  // Add type-specific properties
  if (annotation.type === 'highlight' || annotation.type === 'underline') {
    base.quadPoints = rectsToQuadPoints(annotation.position?.rects || [])
  } else if (annotation.type === 'area') {
    const rect = annotation.position?.boundingRect || annotation.position?.rects?.[0]
    if (rect) {
      base.rect = {
        x1: rect.x1,
        y1: rect.y1,
        x2: rect.x2,
        y2: rect.y2
      }
    }
  } else if (annotation.type === 'ink') {
    base.paths = annotation.position?.paths || []
    base.strokeWidth = annotation.strokeWidth || 2
  } else if (annotation.type === 'note') {
    const rect = annotation.position?.boundingRect
    if (rect) {
      base.rect = {
        x1: rect.x1,
        y1: rect.y1,
        x2: rect.x2,
        y2: rect.y2
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
  const scholarType = TYPE_FROM_EMBEDPDF[embedAnnotation.type] || 'highlight'
  const color = rgbaToHex(embedAnnotation.color)

  // Extract custom metadata if present
  const metadata = embedAnnotation._scholarlib || {}

  const base = {
    id: embedAnnotation.id,
    type: scholarType,
    color,
    created_at: embedAnnotation.createdDate?.toISOString?.() || new Date().toISOString(),
    updated_at: embedAnnotation.modifiedDate?.toISOString?.() || new Date().toISOString(),
    position: {
      page: embedAnnotation.pageIndex ?? 0,
      rects: [],
      boundingRect: null,
      paths: null
    },
    content: metadata.content || { text: '', image: null },
    comment: embedAnnotation.contents || '',
    tags: metadata.tags || [],
    ai_context: metadata.ai_context || { include_in_embeddings: true },
    source: metadata.source || 'embedpdf'
  }

  // Add type-specific position data
  if (embedAnnotation.quadPoints) {
    base.position.rects = quadPointsToRects(embedAnnotation.quadPoints)
    if (base.position.rects.length > 0) {
      base.position.boundingRect = calculateBoundingRect(base.position.rects)
    }
  } else if (embedAnnotation.rect) {
    base.position.rects = [{
      x1: embedAnnotation.rect.x1,
      y1: embedAnnotation.rect.y1,
      x2: embedAnnotation.rect.x2,
      y2: embedAnnotation.rect.y2
    }]
    base.position.boundingRect = { ...embedAnnotation.rect }
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
