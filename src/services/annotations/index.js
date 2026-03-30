export {
  AnnotationService,
  ANNOTATION_COLORS,
  DEFAULT_HIGHLIGHT_COLOR
} from './AnnotationService'

export {
  exportToMarkdown,
  exportForNotes,
  exportToJSON,
  getAnnotationStats
} from './AnnotationExporter'

export {
  AnnotationAdapter,
  toEmbedPDF,
  fromEmbedPDF,
  toEmbedPDFArray,
  fromEmbedPDFArray,
  fromEmbedPDFEvent,
  hexToRgba,
  rgbaToHex
} from './AnnotationAdapter'
