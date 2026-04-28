import { useMemo, useState } from 'react'
import styles from '../Wiki.module.css'

const TIER_ACCENT = {
  high: styles.tierSectionHigh,
  medium: styles.tierSectionMedium,
  low: styles.tierSectionLow,
}

function ChangeCard({
  change,
  decision,
  isFocused,
  isAuditSampled,
  diffComponent,
  onApprove,
  onReject,
  onEdit,
  onShowEvidence,
  onFocus,
  evidenceClaims,
}) {
  const decisionLabel = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'pending'
  return (
    <article
      className={`${styles.changeCard} ${styles[`changeCard_${decisionLabel}`]} ${isFocused ? styles.changeCardFocused : ''}`}
      onClick={() => onFocus?.(change.change_id)}
      data-tier={change.risk_tier}
      data-change-id={change.change_id}
    >
      <header className={styles.changeCardHeader}>
        <div>
          <strong>{change.page_type} · {change.operation}</strong>
          <p className={styles.reason}>{change.risk_reason}</p>
        </div>
        <div className={styles.changeCardActions}>
          {isAuditSampled && <span className={styles.auditBadge}>audit sample</span>}
          <span className={styles.changeCardDecision}>{decisionLabel}</span>
        </div>
      </header>

      {diffComponent}

      {evidenceClaims?.length > 0 && (
        <div className={styles.changeEvidenceList}>
          {evidenceClaims.map((claim, index) => (
            <button
              key={`${claim.claim_text}-${index}`}
              type="button"
              className={styles.changeEvidenceBtn}
              onClick={(event) => { event.stopPropagation(); onShowEvidence?.(change.change_id, claim) }}
            >
              <span className={styles.changeEvidenceClaim}>{claim.claim_text}</span>
              <span className={styles.changeEvidenceStatus}>{claim.verifier_status || 'unverified'}</span>
            </button>
          ))}
        </div>
      )}

      <footer className={styles.changeCardFooter}>
        <button
          type="button"
          className={`${styles.primaryBtn} ${decision === 'approved' ? styles.btnActive : ''}`}
          onClick={(event) => { event.stopPropagation(); onApprove?.(change.change_id) }}
          disabled={change.risk_tier === 'high' && decision === 'approved'}
        >
          {decision === 'approved' ? 'Approved' : 'Approve'}
        </button>
        <button
          type="button"
          className={`${styles.secondaryBtn} ${decision === 'rejected' ? styles.btnActive : ''}`}
          onClick={(event) => { event.stopPropagation(); onReject?.(change.change_id) }}
        >
          {decision === 'rejected' ? 'Rejected' : 'Reject'}
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={(event) => { event.stopPropagation(); onEdit?.(change.change_id) }}
        >
          Edit
        </button>
      </footer>
    </article>
  )
}

export default function RiskTierSection({
  tier,
  changes,
  decisions,
  focusedChangeId,
  auditSampleIds,
  defaultExpanded,
  diffByChangeId,
  evidenceByChangeId,
  onApprove,
  onReject,
  onEdit,
  onShowEvidence,
  onFocus,
  onApproveAll,
  onRejectAll,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const allApproved = useMemo(() => changes.every((change) => decisions[change.change_id] === 'approved'), [changes, decisions])

  if (changes.length === 0) return null
  const accent = TIER_ACCENT[tier] || ''
  const visibleChanges = expanded
    ? changes
    : tier === 'low'
      ? changes.filter((change) => auditSampleIds?.has(change.change_id))
      : []

  return (
    <section className={`${styles.tierSection} ${accent}`} data-tier={tier} aria-labelledby={`tier-${tier}`}>
      <header className={styles.tierSectionHeader}>
        <h3 id={`tier-${tier}`}>{tier === 'high' ? 'High risk' : tier === 'medium' ? 'Medium risk' : 'Low risk'}</h3>
        <span className={styles.tierSectionCount}>
          {changes.length} change{changes.length === 1 ? '' : 's'}
          {tier === 'low' && !expanded && auditSampleIds && (
            <> · audit sample {auditSampleIds.size}</>
          )}
        </span>
        <div className={styles.tierSectionActions}>
          {tier !== 'high' && onApproveAll && (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => onApproveAll(tier)}
              disabled={allApproved}
            >
              {tier === 'low' ? 'Auto-approve all' : 'Approve all'}
            </button>
          )}
          {onRejectAll && (
            <button type="button" className={styles.secondaryBtn} onClick={() => onRejectAll(tier)}>
              Reject all
            </button>
          )}
          {tier === 'low' && (
            <button type="button" className={styles.secondaryBtn} onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? 'Collapse' : 'Expand all'}
            </button>
          )}
        </div>
      </header>
      <div className={styles.tierSectionBody}>
        {visibleChanges.map((change) => (
          <ChangeCard
            key={change.change_id}
            change={change}
            decision={decisions[change.change_id]}
            isFocused={focusedChangeId === change.change_id}
            isAuditSampled={Boolean(auditSampleIds?.has(change.change_id))}
            diffComponent={diffByChangeId?.[change.change_id]}
            evidenceClaims={evidenceByChangeId?.[change.change_id]}
            onApprove={onApprove}
            onReject={onReject}
            onEdit={onEdit}
            onShowEvidence={onShowEvidence}
            onFocus={onFocus}
          />
        ))}
        {tier === 'low' && !expanded && visibleChanges.length === 0 && (
          <p className={styles.diffEmpty}>Low-risk changes auto-approved by default. Expand to inspect.</p>
        )}
      </div>
    </section>
  )
}
