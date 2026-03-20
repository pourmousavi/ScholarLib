import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { Spinner } from '../ui'
import { MetadataExtractor } from '../../services/metadata/MetadataExtractor'
import { aiService } from '../../services/ai/AIService'
import { settingsService } from '../../services/settings/SettingsService'
import { useStorageStore } from '../../store/storageStore'
import MetadataModal from './MetadataModal'
import styles from './UploadZone.module.css'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB

export default function UploadZone({
  folderId,
  onUploadComplete,
  onClose,
  compact = false
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [error, setError] = useState(null)
  const [file, setFile] = useState(null)
  const [extractedText, setExtractedText] = useState('')
  const [pdfBuffer, setPdfBuffer] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [settings, setSettings] = useState(null)

  const inputRef = useRef(null)
  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { remote } = await settingsService.load(isDemoMode ? null : adapter)
        setSettings(remote)
      } catch (error) {
        console.error('Failed to load settings:', error)
        setSettings(settingsService.defaults())
      }
    }
    loadSettings()
  }, [adapter, isDemoMode])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      processFile(files[0])
    }
  }, [])

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) {
      processFile(files[0])
    }
  }

  const handleClick = () => {
    inputRef.current?.click()
  }

  const processFile = async (selectedFile) => {
    setError(null)

    // Validate file type
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file')
      return
    }

    // Validate file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File is too large (max 200MB)')
      return
    }

    setFile(selectedFile)
    setIsProcessing(true)

    try {
      // Step 1: Read file
      setProcessingStatus('Reading PDF...')
      const arrayBuffer = await selectedFile.arrayBuffer()
      setPdfBuffer(arrayBuffer)

      // Step 2: Extract text
      setProcessingStatus('Extracting text...')
      const text = await extractTextFromPDF(arrayBuffer)
      setExtractedText(text)

      // Step 3: Extract metadata
      setProcessingStatus('Looking up metadata...')

      // Check if AI service is available for fallback extraction
      const isAIAvailable = await aiService.checkAvailability()
      const aiServiceForExtraction = isAIAvailable ? aiService : null

      // Show appropriate status based on available methods
      const hasGROBID = settings?.global?.metadata_sources?.grobid !== false
      if (hasGROBID) {
        setProcessingStatus('Looking up metadata (GROBID + API)...')
      } else if (isAIAvailable) {
        setProcessingStatus('Looking up metadata (AI available)...')
      }

      // Pass PDF buffer for GROBID and settings for user preferences
      const extractedMetadata = await MetadataExtractor.extractMetadata(
        text,
        selectedFile.name,
        aiServiceForExtraction,
        arrayBuffer,  // Pass PDF buffer for GROBID
        settings      // Pass user settings
      )

      setMetadata(extractedMetadata)
      setShowModal(true)
    } catch (err) {
      console.error('Processing error:', err)
      setError(err.message || 'Failed to process PDF')
    } finally {
      setIsProcessing(false)
      setProcessingStatus('')
    }
  }

  const extractTextFromPDF = async (arrayBuffer) => {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const textParts = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items.map(item => item.str).join(' ')
      textParts.push(pageText)
    }

    return textParts.join('\n\n')
  }

  const handleSave = async (finalMetadata) => {
    if (onUploadComplete) {
      await onUploadComplete({
        file,
        metadata: finalMetadata,
        folderId,
        extractedText
      })
    }
    setShowModal(false)
    setFile(null)
    setMetadata(null)
    if (onClose) onClose()
  }

  const handleCancel = () => {
    setShowModal(false)
    setFile(null)
    setMetadata(null)
  }

  if (compact) {
    return (
      <>
        <button className={styles.compactBtn} onClick={handleClick}>
          + Add PDF
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {showModal && metadata && (
          <MetadataModal
            metadata={metadata}
            filename={file?.name}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div
        className={`${styles.zone} ${isDragging ? styles.dragging : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {isProcessing ? (
          <div className={styles.processing}>
            <Spinner size={24} />
            <span className={styles.status}>{processingStatus}</span>
          </div>
        ) : (
          <>
            <div className={styles.icon}>📄</div>
            <div className={styles.text}>
              <span className={styles.primary}>Drop PDF here or click to browse</span>
              <span className={styles.secondary}>Max 200MB per file</span>
            </div>
          </>
        )}

        {error && (
          <div className={styles.error}>{error}</div>
        )}
      </div>

      {showModal && metadata && (
        <MetadataModal
          metadata={metadata}
          filename={file?.name}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </>
  )
}
