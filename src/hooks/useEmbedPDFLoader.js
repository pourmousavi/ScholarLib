/**
 * useEmbedPDFLoader - Hook for PDF loading and text extraction with EmbedPDF
 *
 * Since EmbedPDF doesn't expose a public API for full-text extraction,
 * this hook uses the PDFium engine's internal capabilities when available,
 * or falls back to extracting text from the selection plugin page by page.
 *
 * For AI indexing purposes, text extraction happens asynchronously after
 * the document is loaded.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Ensure PDF.js worker is configured
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`
}

/**
 * Extract text from a PDF using PDF.js
 * This is used as a fallback since EmbedPDF doesn't expose text extraction API
 *
 * @param {string} url - PDF URL
 * @param {AbortSignal} signal - Abort signal for cancellation
 * @returns {Promise<string>} Extracted text
 */
async function extractTextWithPDFJS(url, signal) {
  const loadingTask = pdfjsLib.getDocument(url)

  // Handle abort
  if (signal) {
    signal.addEventListener('abort', () => {
      loadingTask.destroy()
    })
  }

  try {
    const pdfDoc = await loadingTask.promise

    if (signal?.aborted) {
      pdfDoc.destroy()
      return ''
    }

    const textParts = []

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      if (signal?.aborted) {
        pdfDoc.destroy()
        return ''
      }

      const page = await pdfDoc.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map(item => item.str).join(' ')
      textParts.push(pageText)
    }

    pdfDoc.destroy()
    return textParts.join('\n\n')
  } catch (error) {
    if (error.name === 'PromiseCancelled' || signal?.aborted) {
      return ''
    }
    throw error
  }
}

/**
 * Hook for extracting text from a PDF for AI indexing
 *
 * @param {string} url - PDF URL
 * @param {Object} options - Options
 * @param {boolean} options.enabled - Whether to enable extraction
 * @returns {Object} { extractedText, isExtracting, error }
 */
export function useEmbedPDFTextExtraction(url, options = {}) {
  const { enabled = true } = options
  const [extractedText, setExtractedText] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState(null)
  const abortControllerRef = useRef(null)

  useEffect(() => {
    if (!url || !enabled) {
      setExtractedText('')
      setError(null)
      return
    }

    // Cancel any ongoing extraction
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    const extractText = async () => {
      setIsExtracting(true)
      setError(null)

      try {
        // Use PDF.js for text extraction (reliable and well-tested)
        const text = await extractTextWithPDFJS(url, abortController.signal)

        if (!abortController.signal.aborted) {
          setExtractedText(text)
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error('Text extraction failed:', err)
          setError(err.message || 'Failed to extract text')
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsExtracting(false)
        }
      }
    }

    // Start extraction in background
    extractText()

    return () => {
      abortController.abort()
    }
  }, [url, enabled])

  return {
    extractedText,
    isExtracting,
    error
  }
}

/**
 * Hook for loading PDF metadata using EmbedPDF engine
 * Used for document info like title, author, page count
 *
 * @param {Object} document - EmbedPDF document object from DocumentContent
 * @returns {Object} Document metadata
 */
export function useEmbedPDFMetadata(document) {
  const [metadata, setMetadata] = useState({
    pageCount: 0,
    title: '',
    author: '',
    subject: '',
    keywords: ''
  })

  useEffect(() => {
    if (!document) {
      setMetadata({
        pageCount: 0,
        title: '',
        author: '',
        subject: '',
        keywords: ''
      })
      return
    }

    // Extract metadata from document
    setMetadata({
      pageCount: document.pageCount || 0,
      title: document.info?.title || '',
      author: document.info?.author || '',
      subject: document.info?.subject || '',
      keywords: document.info?.keywords || ''
    })
  }, [document])

  return metadata
}

export default useEmbedPDFTextExtraction
