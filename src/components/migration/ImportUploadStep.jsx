import { useState, useRef } from 'react'
import { migrationService } from '../../services/migration/MigrationService'
import styles from './MigrationWizard.module.css'

export default function ImportUploadStep({ onBundleUploaded, onCancel }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [summary, setSummary] = useState(null)
  const fileInputRef = useRef(null)

  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      await processFile(files[0])
    }
  }

  const handleFileSelect = async (e) => {
    const files = e.target.files
    if (files.length > 0) {
      await processFile(files[0])
    }
  }

  const processFile = async (file) => {
    setError(null)
    setParsing(true)

    // Check file extension
    if (!file.name.endsWith('.scholarlib')) {
      setError('Please select a .scholarlib file')
      setParsing(false)
      return
    }

    try {
      const bundle = await migrationService.parseBundle(file)
      const bundleSummary = migrationService.getBundleSummary(bundle)
      setSummary(bundleSummary)

      // Short delay to show the summary before proceeding
      setTimeout(() => {
        onBundleUploaded(bundle)
      }, 500)
    } catch (err) {
      setError(err.message)
      setParsing(false)
    }
  }

  const handleBrowse = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className={styles.stepContent}>
      <p className={styles.intro}>
        Select your ScholarLib export bundle to begin importing.
      </p>

      <div
        className={`${styles.dropZone} ${dragging ? styles.dragging : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".scholarlib"
          onChange={handleFileSelect}
          className={styles.hiddenInput}
        />

        {parsing ? (
          <div className={styles.parsingState}>
            <div className={styles.spinner} />
            <p>Reading bundle...</p>
            {summary && (
              <div className={styles.parsingSummary}>
                Found {summary.documentCount} documents, {summary.folderCount} folders
              </div>
            )}
          </div>
        ) : (
          <>
            <div className={styles.dropIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className={styles.dropText}>
              Drop your <code>.scholarlib</code> file here
            </p>
            <p className={styles.dropOr}>or</p>
            <button className={styles.browseBtn} onClick={handleBrowse}>
              Browse Files
            </button>
          </>
        )}
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      <div className={styles.infoBox}>
        <strong>Before importing:</strong>
        <ol>
          <li>Make sure you've copied your PDFs to the new storage provider</li>
          <li>PDFs should be in a <code>ScholarLib/PDFs/</code> folder</li>
          <li>The original folder structure should be preserved if possible</li>
        </ol>
      </div>

      <div className={styles.stepFooter}>
        <button className={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
