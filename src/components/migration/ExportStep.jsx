import { useState, useEffect } from 'react'
import { migrationService } from '../../services/migration/MigrationService'
import styles from './MigrationWizard.module.css'

export default function ExportStep({ adapter, provider, onComplete, onCancel }) {
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [bundle, setBundle] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const exportBundle = await migrationService.exportBundle(adapter, provider)
        const bundleSummary = migrationService.getBundleSummary(exportBundle)
        setBundle(exportBundle)
        setSummary(bundleSummary)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [adapter, provider])

  const handleDownload = () => {
    if (!bundle) return

    setExporting(true)
    try {
      const date = new Date().toISOString().split('T')[0]
      migrationService.downloadBundle(bundle, `scholarlib-${date}`)
      onComplete()
    } catch (err) {
      setError(err.message)
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <p>Loading library data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <div className={styles.errorIcon}>!</div>
        <p className={styles.errorText}>{error}</p>
        <button className={styles.secondaryBtn} onClick={onCancel}>
          Close
        </button>
      </div>
    )
  }

  return (
    <div className={styles.stepContent}>
      <p className={styles.intro}>
        Export your entire library to a portable bundle file. This includes all folders,
        documents, metadata, notes, and chat history.
      </p>

      <div className={styles.summaryCard}>
        <h4>Export Summary</h4>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{summary.folderCount}</span>
            <span className={styles.summaryLabel}>Folders</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{summary.documentCount}</span>
            <span className={styles.summaryLabel}>Documents</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{summary.noteCount}</span>
            <span className={styles.summaryLabel}>Notes</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryValue}>{summary.conversationCount}</span>
            <span className={styles.summaryLabel}>Conversations</span>
          </div>
        </div>
      </div>

      <div className={styles.infoBox}>
        <strong>What's included:</strong>
        <ul>
          <li>All folder structure and organization</li>
          <li>Document metadata (title, authors, DOI, etc.)</li>
          <li>Your notes and annotations</li>
          <li>AI chat history with references</li>
        </ul>
      </div>

      <div className={styles.warningBox}>
        <strong>Important:</strong>
        <p>
          PDF files are <em>not</em> included in the bundle. You'll need to copy them separately
          using your storage provider's tools (Box or Dropbox desktop app, web interface, etc.).
        </p>
      </div>

      <div className={styles.stepFooter}>
        <button className={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button
          className={styles.primaryBtn}
          onClick={handleDownload}
          disabled={exporting}
        >
          {exporting ? 'Downloading...' : 'Download Bundle'}
        </button>
      </div>
    </div>
  )
}
