import styles from '../Wiki.module.css'

const SEVERITY_LABEL = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
}

function isAutoFixable(finding) {
  return finding.code === 'PAGE_MISSING_FROM_SIDECAR'
    || finding.code === 'PAGE_REVISION_MISMATCH'
    || finding.code === 'SIDECAR_PAGE_NOT_FOUND'
    || finding.auto_fixable === true
}

export default function LintReportView({ findings = [], onApplyFix, onApplyAll, onDismiss }) {
  const fixable = findings.filter(isAutoFixable)
  if (findings.length === 0) {
    return (
      <section className={styles.lintReport}>
        <h3>Lint findings</h3>
        <p className={styles.empty}>No lint findings.</p>
      </section>
    )
  }
  return (
    <section className={styles.lintReport} aria-label="Lint findings">
      <header className={styles.lintReportHeader}>
        <h3>Lint findings</h3>
        <div className={styles.lintReportActions}>
          {fixable.length > 0 && onApplyAll && (
            <button type="button" className={styles.secondaryBtn} onClick={() => onApplyAll(fixable)}>
              Apply all auto-fixable ({fixable.length})
            </button>
          )}
          {onDismiss && (
            <button type="button" className={styles.secondaryBtn} onClick={onDismiss}>Dismiss</button>
          )}
        </div>
      </header>
      <ul className={styles.lintList}>
        {findings.map((finding, index) => (
          <li key={finding.id || `${finding.code}-${index}`} className={styles.lintItem} data-severity={finding.severity}>
            <header>
              <strong>{SEVERITY_LABEL[finding.severity] || finding.severity}</strong>
              <span className={styles.lintCode}>{finding.code}</span>
              {finding.page_id && <span>· {finding.page_id}</span>}
            </header>
            {finding.message && <p>{finding.message}</p>}
            {finding.proposed_fix && <p className={styles.lintFix}>Suggested fix: {finding.proposed_fix}</p>}
            {isAutoFixable(finding) && onApplyFix && (
              <button type="button" className={styles.secondaryBtn} onClick={() => onApplyFix(finding)}>
                Apply fix
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export { isAutoFixable }
