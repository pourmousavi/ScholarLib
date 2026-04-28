import { useMemo, useState } from 'react'
import {
  METRIC_LABELS,
  QUALITY_THRESHOLDS,
  aggregateMetrics,
  detectThresholdViolations,
  summariseCosts,
} from '../../services/wiki/phase1/QualityMetrics'
import styles from './Wiki.module.css'

function formatMetricValue(metricKey, value) {
  if (value == null || Number.isNaN(value)) return '—'
  if (metricKey === 'high_impact_claim_rejection_rate' || metricKey === 'manual_cleanup_rate') {
    return `${(value * 100).toFixed(1)}%`
  }
  if (metricKey === 'concept_page_usefulness_average') {
    return value.toFixed(2)
  }
  if (metricKey === 'average_review_minutes') {
    return `${value.toFixed(1)} min`
  }
  return String(value)
}

function formatThreshold(metricKey, threshold) {
  const value = formatMetricValue(metricKey, threshold.value)
  return threshold.kind === 'max' ? `≤ ${value}` : `≥ ${value}`
}

function formatCurrency(value) {
  if (!value || Number.isNaN(value)) return '$0.00'
  return `$${value.toFixed(2)}`
}

function StatusBadge({ status }) {
  const labels = { green: 'OK', amber: 'Watch', red: 'Stop', pending: 'No data' }
  return <span className={`${styles.metricBadge} ${styles[`status_${status}`] || ''}`}>{labels[status] || status}</span>
}

export default function QualityDashboard({
  checklists = [],
  usefulnessRatings = [],
  schemaMigrations = [],
  manualCleanupCount = 0,
  overrides = [],
  onRunSchemaRevision,
  onAbandonPhase1,
  onLogOverride,
  onGenerateReport,
}) {
  const aggregate = useMemo(
    () => aggregateMetrics({ checklists, usefulnessRatings, manualCleanupCount, schemaMigrations }),
    [checklists, usefulnessRatings, manualCleanupCount, schemaMigrations]
  )
  const cost = useMemo(() => summariseCosts(checklists), [checklists])
  const violations = useMemo(() => detectThresholdViolations(aggregate.metrics), [aggregate.metrics])

  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  const paperCount = aggregate.paper_count
  const canRevise = paperCount >= 5
  const blocked = violations.length > 0 && !overrides.some((entry) => entry.decision === 'continue_without_changes' && entry.paper_index === paperCount)

  const submitOverride = async () => {
    if (!overrideReason.trim()) return
    const violation = violations[0]
    await onLogOverride?.({
      reason: overrideReason.trim(),
      metric: violation?.metric,
      value: violation?.value,
      decision: 'continue_without_changes',
      paper_index: paperCount,
    })
    setOverrideOpen(false)
    setOverrideReason('')
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <div>
          <h2>Phase 1 quality dashboard</h2>
          <p>{paperCount} of 10 papers ingested · {violations.length} threshold violation{violations.length === 1 ? '' : 's'}</p>
        </div>
        {onGenerateReport && (
          <button type="button" className={styles.secondaryBtn} onClick={() => onGenerateReport()}>
            Generate Phase 1 report
          </button>
        )}
      </header>

      <section className={styles.metricGrid}>
        {Object.entries(QUALITY_THRESHOLDS).map(([key, threshold]) => {
          const entry = aggregate.metrics[key] || { value: null, trend: null, sample_size: 0, status: 'pending' }
          return (
            <article key={key} className={`${styles.metricCard} ${styles[`status_${entry.status}`] || ''}`}>
              <header>
                <h3>{METRIC_LABELS[key]}</h3>
                <StatusBadge status={entry.status} />
              </header>
              <div className={styles.metricValue}>{formatMetricValue(key, entry.value)}</div>
              <dl>
                <div>
                  <dt>Trend (last 5 papers)</dt>
                  <dd>{formatMetricValue(key, entry.trend)}</dd>
                </div>
                <div>
                  <dt>Threshold</dt>
                  <dd>{formatThreshold(key, threshold)}</dd>
                </div>
                <div>
                  <dt>Sample size</dt>
                  <dd>{entry.sample_size ?? 0}</dd>
                </div>
              </dl>
            </article>
          )
        })}
      </section>

      <section>
        <h3>Per-paper history</h3>
        {checklists.length === 0 ? (
          <p className={styles.empty}>No papers ingested yet.</p>
        ) : (
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Date</th>
                <th>Review</th>
                <th>Claims</th>
                <th>Schema issues</th>
              </tr>
            </thead>
            <tbody>
              {checklists.map((checklist, index) => {
                const review = checklist.steps?.find((step) => step.name === 'review') || {}
                const verify = checklist.steps?.find((step) => step.name === 'verify_claims') || {}
                return (
                  <tr key={checklist.paper_id}>
                    <td>{index + 1}</td>
                    <td>{checklist.paper_title || checklist.paper_id}</td>
                    <td>{checklist.ingested_at?.slice(0, 10) || '—'}</td>
                    <td>{(Number(review.duration_seconds_human) || 0) / 60 ? `${((Number(review.duration_seconds_human) || 0) / 60).toFixed(1)} min` : '—'}</td>
                    <td>
                      {verify.claims_supported || 0}✓ / {verify.claims_weak || 0}~ / {verify.claims_unsupported || 0}✗
                    </td>
                    <td>{(checklist.schema_issues_observed || []).map((entry) => entry.tag).join(', ') || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.costSummary}>
        <h3>Phase 1 spend</h3>
        <ul>
          <li>Total: {formatCurrency(cost.total)}</li>
          <li>Extract: {formatCurrency(cost.extract)}</li>
          <li>Verify claims: {formatCurrency(cost.verify_claims)}</li>
          <li>Apply: {formatCurrency(cost.apply)}</li>
          <li>Projected steady state (10 papers): {formatCurrency(cost.projected_steady_state_usd)}</li>
        </ul>
      </section>

      {blocked && (
        <div role="dialog" aria-label="Quality threshold pause" className={styles.dashboardPause}>
          <h3>Ingestion paused</h3>
          <ul>
            {violations.map((violation) => (
              <li key={violation.metric}>
                <strong>{METRIC_LABELS[violation.metric]}</strong> crossed threshold{' '}
                ({formatMetricValue(violation.metric, violation.value)} vs {formatThreshold(violation.metric, violation.threshold)})
              </li>
            ))}
          </ul>
          <div className={styles.dashboardPauseActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setOverrideOpen(true)}>
              Continue without changes
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={!canRevise}
              onClick={() => onRunSchemaRevision?.()}
              title={canRevise ? '' : 'Schema revision is only available after 5 papers'}
            >
              Run schema revision
            </button>
            <button type="button" className={styles.dangerBtn} onClick={() => onAbandonPhase1?.()}>
              Abandon Phase 1
            </button>
          </div>
          {overrideOpen && (
            <div className={styles.dashboardOverride}>
              <label htmlFor="override-reason">Justification (logged):</label>
              <textarea
                id="override-reason"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
              />
              <button type="button" className={styles.primaryBtn} onClick={submitOverride} disabled={!overrideReason.trim()}>
                Log override
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
