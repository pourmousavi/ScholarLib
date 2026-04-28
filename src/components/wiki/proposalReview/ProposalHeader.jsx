import styles from '../Wiki.module.css'

function relativeAge(iso, now = Date.now()) {
  if (!iso) return ''
  const ms = now - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function ProposalHeader({ proposal, tierTotals, onOpenPdf, onClose, onRejectAll }) {
  const source = proposal?.source || {}
  const extraction = proposal?.extraction_metadata || {}
  return (
    <header className={styles.reviewHeader}>
      <div className={styles.reviewHeaderMain}>
        <h2>{source.title || proposal?.proposal_id}</h2>
        <p className={styles.reviewHeaderMeta}>
          {source.doi ? <span>{source.doi}</span> : null}
          {extraction.extraction_version ? <span>· model {extraction.extraction_version}</span> : null}
          {Number.isFinite(extraction.cost_usd) ? <span>· ${Number(extraction.cost_usd).toFixed(3)}</span> : null}
          <span>· {relativeAge(proposal?.created_at)}</span>
        </p>
        <p className={styles.reviewHeaderTiers}>
          <span className={`${styles.tier} ${styles.high}`}>{tierTotals.high} high</span>
          <span className={`${styles.tier} ${styles.medium}`}>{tierTotals.medium} medium</span>
          <span className={`${styles.tier} ${styles.low}`}>{tierTotals.low} low</span>
        </p>
      </div>
      <div className={styles.reviewHeaderActions}>
        {source.scholarlib_doc_id && onOpenPdf && (
          <button type="button" className={styles.secondaryBtn} onClick={() => onOpenPdf({ scholarlib_doc_id: source.scholarlib_doc_id })}>
            Open source PDF
          </button>
        )}
        {onRejectAll && (
          <button type="button" className={styles.dangerBtn} onClick={onRejectAll}>Reject entire proposal</button>
        )}
        {onClose && (
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Back to inbox</button>
        )}
      </div>
    </header>
  )
}

export { relativeAge }
