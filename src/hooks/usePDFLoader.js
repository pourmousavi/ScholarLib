import { useState, useEffect, useCallback, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

export function usePDFLoader(url, initialZoom = 100) {
  const [pdf, setPdf] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(initialZoom)
  const [extractedText, setExtractedText] = useState('')

  const pdfRef = useRef(null)
  const loadingTaskRef = useRef(null)
  const extractionAbortRef = useRef(null)

  const loadPDF = useCallback(async () => {
    if (!url) {
      // Clean up existing PDF
      if (pdfRef.current) {
        pdfRef.current.destroy()
        pdfRef.current = null
      }
      setPdf(null)
      setTotalPages(0)
      setCurrentPage(1)
      return
    }

    // Cancel any pending loading task (only if still loading)
    if (loadingTaskRef.current) {
      try {
        loadingTaskRef.current.destroy()
      } catch (e) {
        // Ignore errors from destroying already-completed tasks
      }
      loadingTaskRef.current = null
    }

    // Abort any ongoing text extraction before destroying the PDF
    if (extractionAbortRef.current) {
      extractionAbortRef.current.abort()
      extractionAbortRef.current = null
    }

    // Clean up previous PDF document
    if (pdfRef.current) {
      pdfRef.current.destroy()
      pdfRef.current = null
    }

    setLoading(true)
    setError(null)

    try {
      const loadingTask = pdfjsLib.getDocument(url)
      loadingTaskRef.current = loadingTask

      const pdfDoc = await loadingTask.promise

      // Clear loading task ref after successful load
      loadingTaskRef.current = null

      pdfRef.current = pdfDoc
      setPdf(pdfDoc)
      setTotalPages(pdfDoc.numPages)
      setCurrentPage(1)
      setLoading(false)

      // Extract text in background
      extractAllText(pdfDoc)
    } catch (err) {
      loadingTaskRef.current = null
      if (err.name !== 'PromiseCancelled' && err.name !== 'AbortException') {
        setError(err.message || 'Failed to load PDF')
        setLoading(false)
      }
    }
  }, [url])

  const extractAllText = async (pdfDoc) => {
    // Create abort controller for this extraction
    const abortController = new AbortController()
    extractionAbortRef.current = abortController

    try {
      const textParts = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        // Check if extraction was aborted
        if (abortController.signal.aborted) {
          return
        }

        // Also verify the PDF document is still the current one
        if (pdfRef.current !== pdfDoc) {
          return
        }

        try {
          const page = await pdfDoc.getPage(i)

          // Check abort again after async operation
          if (abortController.signal.aborted || pdfRef.current !== pdfDoc) {
            return
          }

          const textContent = await page.getTextContent()

          // Check abort again
          if (abortController.signal.aborted || pdfRef.current !== pdfDoc) {
            return
          }

          const pageText = textContent.items.map(item => item.str).join(' ')
          textParts.push(pageText)
        } catch (pageErr) {
          // Gracefully handle worker destruction errors
          if (pageErr.message?.includes('Worker was destroyed') ||
              pageErr.message?.includes('transport is destroyed')) {
            return
          }
          throw pageErr
        }
      }

      // Only set text if we weren't aborted and PDF is still current
      if (!abortController.signal.aborted && pdfRef.current === pdfDoc) {
        setExtractedText(textParts.join('\n\n'))
      }
    } catch (err) {
      // Ignore worker destruction errors
      if (err.message?.includes('Worker was destroyed') ||
          err.message?.includes('transport is destroyed')) {
        return
      }
      console.error('Text extraction failed:', err)
    }
  }

  useEffect(() => {
    loadPDF()
    return () => {
      // Cancel any pending loading task on unmount
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy()
        } catch (e) {
          // Ignore
        }
        loadingTaskRef.current = null
      }
      // Abort any ongoing text extraction
      if (extractionAbortRef.current) {
        extractionAbortRef.current.abort()
        extractionAbortRef.current = null
      }
      // Clean up PDF document on unmount
      if (pdfRef.current) {
        pdfRef.current.destroy()
        pdfRef.current = null
      }
    }
  }, [loadPDF])

  const goToPage = useCallback((page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }, [totalPages])

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1)
  }, [currentPage, goToPage])

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1)
  }, [currentPage, goToPage])

  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 25, 200))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(z - 25, 50))
  }, [])

  const retry = useCallback(() => {
    loadPDF()
  }, [loadPDF])

  return {
    pdf,
    loading,
    error,
    currentPage,
    totalPages,
    zoom,
    extractedText,
    goToPage,
    nextPage,
    prevPage,
    zoomIn,
    zoomOut,
    setZoom,
    retry
  }
}
