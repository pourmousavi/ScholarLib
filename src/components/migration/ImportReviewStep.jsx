import { useState } from 'react'
import { migrationService } from '../../services/migration/MigrationService'
import { pdfRelinkService } from '../../services/migration/PDFRelinkService'
import styles from './MigrationWizard.module.css'

export default function ImportReviewStep({ adapter, bundle, matchResults, onComplete, onBack, onCancel }) {
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState(null)

  const { matched, missing } = matchResults
  const summary = migrationService.getBundleSummary(bundle)

  const handleImport = async () => {
    setImporting(true)
    setError(null)

    try {
      // Apply path updates to bundle
      const updatedBundle = pdfRelinkService.applyPathUpdates(bundle, matched)

      // Import the bundle
      await migrationService.importBundle(adapter, updatedBundle, { mode: 'replace' })

      onComplete({
        totalDocuments: Object.keys(bundle.library.documents).length,
        matchedCount: matched.length,
        missingCount: missing.length,
        foldersImported: bundle.library.folders.length,
        notesImported: Object.keys(bundle.notes?.notes || {}).length,
        conversationsImported: bundle.chat_history?.conversations?.length || 0
      })
    } catch (err) {
      setError(err.message)
      setImporting(false)
    }
  }

  return (
    <div className={styles.stepContent}>
      <p className={styles.intro}>
        Review what will be imported before proceeding.
      </p>

      {/* Match Results */}
      <div className={styles.resultsSummary}>
        <div className={`${styles.resultCard} ${styles.success}`}>
          <span className={styles.resultValue}>{matched.length}</span>
          <span className={styles.resultLabel}>PDFs Found</span>
        </div>
        <div className={`${styles.resultCard} ${missing.length > 0 ? styles.warning : styles.neutral}`}>
          <span className={styles.resultValue}>{missing.length}</span>
          <span className={styles.resultLabel}>PDFs Missing</span>
        </div>
      </div>

      {/* What will be imported */}
      <div className={styles.importDetails}>
        <h4>Will be imported:</h4>
        <ul>
          <li>{summary.folderCount} folders</li>
          <li>{matched.length} documents with PDFs</li>
          <li>{missing.length} documents without PDFs (metadata only)</li>
          <li>{summary.noteCount} notes</li>
          <li>{summary.conversationCount} chat conversations</li>
        </ul>
      </div>

      {/* Missing files warning */}
      {missing.length > 0 && (
        <div className={styles.missingSection}>
          <h4>Missing PDFs ({missing.length})</h4>
          <p className={styles.missingNote}>
            These documents will be imported without their PDFs. You can add the PDFs later.
          </p>
          <div className={styles.missingList}>
            {missing.slice(0, 5).map((item) => (
              <div key={item.docId} className={styles.missingItem}>
                <span className={styles.missingTitle}>{item.title}</span>
                <span className={styles.missingFilename}>{item.filename}</span>
              </div>
            ))}
            {missing.length > 5 && (
              <div className={styles.missingMore}>
                + {missing.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warning about replacing existing data */}
      <div className={styles.warningBox}>
        <strong>Warning:</strong>
        <p>
          This will replace your current library data. Make sure you have a backup if needed.
        </p>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      <div className={styles.stepFooter}>
        <button
          className={styles.secondaryBtn}
          onClick={onBack}
          disabled={importing}
        >
          Back
        </button>
        <button
          className={styles.primaryBtn}
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? 'Importing...' : 'Import Library'}
        </button>
      </div>
    </div>
  )
}
