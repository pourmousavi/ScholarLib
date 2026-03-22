import styles from './MigrationWizard.module.css'

export default function ImportCompleteStep({ stats, onDone }) {
  return (
    <div className={styles.stepContent}>
      <div className={styles.successState}>
        <div className={styles.successIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <h3>Import Complete!</h3>

        <p className={styles.successText}>
          Your library has been successfully imported.
        </p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.foldersImported}</span>
          <span className={styles.statLabel}>Folders</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.matchedCount}</span>
          <span className={styles.statLabel}>Documents</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.notesImported}</span>
          <span className={styles.statLabel}>Notes</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.conversationsImported}</span>
          <span className={styles.statLabel}>Conversations</span>
        </div>
      </div>

      {stats.missingCount > 0 && (
        <div className={styles.infoBox}>
          <strong>Note:</strong>
          <p>
            {stats.missingCount} document{stats.missingCount > 1 ? 's' : ''} were imported without PDFs.
            You can upload the missing PDFs and re-link them later.
          </p>
        </div>
      )}

      <div className={styles.nextSteps}>
        <h4>Next Steps</h4>
        <ol>
          <li>
            <strong>Re-index your documents</strong> — Go to Settings → Export & Privacy → "Re-index all documents"
            to rebuild the AI search index.
          </li>
          <li>
            <strong>Verify your library</strong> — Browse your folders to ensure everything imported correctly.
          </li>
          {stats.missingCount > 0 && (
            <li>
              <strong>Add missing PDFs</strong> — Upload any PDFs that weren't found during the scan.
            </li>
          )}
        </ol>
      </div>

      <div className={styles.stepFooter}>
        <button className={styles.primaryBtn} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}
