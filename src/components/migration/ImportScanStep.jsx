import { useState, useEffect } from 'react'
import { pdfRelinkService } from '../../services/migration/PDFRelinkService'
import styles from './MigrationWizard.module.css'

export default function ImportScanStep({ adapter, bundle, onComplete, onCancel }) {
  const [progress, setProgress] = useState({ current: 0, total: 0, message: 'Starting...' })
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const runScan = async () => {
      try {
        // Scan for PDFs
        const pdfIndex = await pdfRelinkService.scanForPDFs(adapter, (current, total, message) => {
          setProgress({ current, total, message })
        })

        // Match documents to found PDFs
        const matchResults = pdfRelinkService.matchDocuments(bundle, pdfIndex)

        setScanning(false)

        // Short delay before moving to next step
        setTimeout(() => {
          onComplete(matchResults)
        }, 500)
      } catch (err) {
        setError(err.message)
        setScanning(false)
      }
    }

    runScan()
  }, [adapter, bundle, onComplete])

  if (error) {
    return (
      <div className={styles.stepContent}>
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>!</div>
          <p className={styles.errorText}>{error}</p>
          <button className={styles.secondaryBtn} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.stepContent}>
      <div className={styles.scanningState}>
        <div className={styles.scanIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>

        <p className={styles.scanText}>
          {scanning ? 'Scanning for PDFs in storage...' : 'Matching documents...'}
        </p>

        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: progress.total > 0
                  ? `${(progress.current / progress.total) * 100}%`
                  : scanning ? '30%' : '100%'
              }}
            />
          </div>
          <p className={styles.progressText}>{progress.message}</p>
        </div>
      </div>
    </div>
  )
}
