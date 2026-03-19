import { useState, useEffect, useCallback, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

export function usePDFLoader(url) {
  const [pdf, setPdf] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [extractedText, setExtractedText] = useState('')

  const pdfRef = useRef(null)
  const loadingTaskRef = useRef(null)

  const loadPDF = useCallback(async () => {
    if (!url) {
      setPdf(null)
      setTotalPages(0)
      setCurrentPage(1)
      return
    }

    // Cancel any existing loading task
    if (loadingTaskRef.current) {
      loadingTaskRef.current.destroy()
    }

    setLoading(true)
    setError(null)

    try {
      const loadingTask = pdfjsLib.getDocument(url)
      loadingTaskRef.current = loadingTask

      const pdfDoc = await loadingTask.promise
      pdfRef.current = pdfDoc
      setPdf(pdfDoc)
      setTotalPages(pdfDoc.numPages)
      setCurrentPage(1)
      setLoading(false)

      // Extract text in background
      extractAllText(pdfDoc)
    } catch (err) {
      if (err.name !== 'PromiseCancelled') {
        setError(err.message || 'Failed to load PDF')
        setLoading(false)
      }
    }
  }, [url])

  const extractAllText = async (pdfDoc) => {
    try {
      const textParts = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map(item => item.str).join(' ')
        textParts.push(pageText)
      }
      setExtractedText(textParts.join('\n\n'))
    } catch (err) {
      console.error('Text extraction failed:', err)
    }
  }

  useEffect(() => {
    loadPDF()
    return () => {
      if (loadingTaskRef.current) {
        loadingTaskRef.current.destroy()
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
