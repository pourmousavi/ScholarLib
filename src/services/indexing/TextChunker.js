/**
 * TextChunker - Splits text into overlapping chunks for embedding
 */
class TextChunker {
  /**
   * Split text into overlapping chunks
   * @param {string} text - Text to chunk
   * @param {Object} options - Chunking options
   * @param {number} options.chunkSize - Words per chunk (default 512)
   * @param {number} options.overlap - Overlap words between chunks (default 50)
   * @param {Array} options.annotations - Optional annotations to include in context
   * @returns {Array<{text: string, index: number}>}
   */
  chunk(text, { chunkSize = 512, overlap = 50, annotations = [] } = {}) {
    if (!text || typeof text !== 'string') {
      return []
    }

    const words = text.split(/\s+/).filter(w => w.length > 0)
    const chunks = []
    let i = 0
    let index = 0

    while (i < words.length) {
      const chunkWords = words.slice(i, i + chunkSize)
      let chunkText = chunkWords.join(' ')

      if (chunkText.trim()) {
        chunks.push({
          text: chunkText,
          index: index,
          wordStart: i,
          wordEnd: Math.min(i + chunkSize, words.length)
        })
        index++
      }

      i += chunkSize - overlap
    }

    // If there are annotations, create a dedicated annotation chunk
    if (annotations && annotations.length > 0) {
      const annotationText = this.formatAnnotationsForEmbedding(annotations)
      if (annotationText.trim()) {
        chunks.push({
          text: annotationText,
          index: index,
          wordStart: -1, // Special marker for annotation chunk
          wordEnd: -1,
          isAnnotationChunk: true
        })
      }
    }

    return chunks
  }

  /**
   * Format annotations for embedding
   * Includes highlighted text and user comments
   * @param {Array} annotations - Annotations from AnnotationService
   * @returns {string} Formatted annotation text
   */
  formatAnnotationsForEmbedding(annotations) {
    // Filter annotations that should be included in AI context
    const includedAnnotations = annotations.filter(
      a => a.ai_context?.include_in_embeddings !== false
    )

    if (includedAnnotations.length === 0) {
      return ''
    }

    const parts = ['[USER ANNOTATIONS AND HIGHLIGHTS]']

    // Sort by page for logical ordering
    includedAnnotations.sort((a, b) => (a.position?.page || 0) - (b.position?.page || 0))

    for (const annotation of includedAnnotations) {
      const highlightText = annotation.content?.text || ''
      const comment = annotation.comment || ''
      const page = annotation.position?.page

      if (highlightText || comment) {
        let entry = ''

        if (highlightText) {
          entry += `[HIGHLIGHTED on page ${page}]: "${highlightText}"`
        }

        if (comment) {
          if (highlightText) {
            entry += ` [USER NOTE]: ${comment}`
          } else {
            entry += `[USER NOTE on page ${page}]: ${comment}`
          }
        }

        parts.push(entry)
      }
    }

    return parts.join('\n')
  }

  /**
   * Extract text from PDF using PDF.js
   * @param {string} pdfURL - URL to PDF file
   * @param {Object} pdfjsLib - PDF.js library instance
   * @param {Function} onProgress - Progress callback (page, totalPages)
   * @returns {Promise<{text: string, pageTexts: string[]}>}
   */
  async extractTextFromPDF(pdfURL, pdfjsLib, onProgress) {
    const pdf = await pdfjsLib.getDocument(pdfURL).promise
    const pageTexts = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items.map(item => item.str).join(' ')
      pageTexts.push(pageText)

      onProgress?.(i, pdf.numPages)
    }

    return {
      text: pageTexts.join('\n\n'),
      pageTexts
    }
  }

  /**
   * Clean and normalize text for better embeddings
   * @param {string} text - Raw text
   * @returns {string}
   */
  cleanText(text) {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove page numbers and headers/footers (common patterns)
      .replace(/\n\d+\n/g, '\n')
      // Normalize unicode
      .normalize('NFKC')
      .trim()
  }

  /**
   * Estimate page number for a chunk based on word position
   * @param {Object} chunk - Chunk with wordStart
   * @param {string[]} pageTexts - Text per page
   * @returns {number} Approximate page number (1-indexed)
   */
  estimatePageNumber(chunk, pageTexts) {
    let wordCount = 0
    for (let i = 0; i < pageTexts.length; i++) {
      const pageWords = pageTexts[i].split(/\s+/).length
      wordCount += pageWords
      if (wordCount >= chunk.wordStart) {
        return i + 1
      }
    }
    return pageTexts.length
  }
}

export const textChunker = new TextChunker()
