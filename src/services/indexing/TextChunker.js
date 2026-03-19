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
   * @returns {Array<{text: string, index: number}>}
   */
  chunk(text, { chunkSize = 512, overlap = 50 } = {}) {
    if (!text || typeof text !== 'string') {
      return []
    }

    const words = text.split(/\s+/).filter(w => w.length > 0)
    const chunks = []
    let i = 0
    let index = 0

    while (i < words.length) {
      const chunkWords = words.slice(i, i + chunkSize)
      const chunkText = chunkWords.join(' ')

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

    return chunks
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
