import { useMemo, useState } from 'react'
import {
  METRIC_LABELS,
  PHASE3_QUALITY_THRESHOLDS,
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
  phase = 'phase1',
  perThemeCoverage = null,
  crossPaperCoherence = null,
  bootstrapProgress = null,
  costProjection = null,
  schemaRevisionAvailable = false,
  schemaRevisionTaken = false,
  onTakeMidBootstrapSchemaRevision,
  onSkipMidBootstrapSchemaRevision,
  onGeneratePhase3Report,
}) {
  const isPhase3 = phase === 'phase3'
  const thresholds = isPhase3 ? PHASE3_QUALITY_THRESHOLDS : QUALITY_THRESHOLDS
  const aggregate = useMemo(
    () => aggregateMetrics({ checklists, usefulnessRatings, manualCleanupCount, schemaMigrations, thresholds }),
    [checklists, usefulnessRatings, manualCleanupCount, schemaMigrations, thresholds]
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
          <h2>{isPhase3 ? 'Phase 3 quality dashboard' : 'Phase 1 quality dashboard'}</h2>
          <p>
            {isPhase3 ? `${paperCount} bootstrap papers ingested` : `${paperCount} of 10 papers ingested`}
            {' · '}
            {violations.length} threshold violation{violations.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className={styles.dashboardActions}>
          {onGenerateReport && !isPhase3 && (
            <button type="button" className={styles.secondaryBtn} onClick={() => onGenerateReport()}>
              Generate Phase 1 report
            </button>
          )}
          {isPhase3 && onGeneratePhase3Report && (
            <button type="button" className={styles.secondaryBtn} onClick={() => onGeneratePhase3Report()}>
              Generate Phase 3 report
            </button>
          )}
        </div>
      </header>

      {isPhase3 && schemaRevisionAvailable && !schemaRevisionTaken && (
        <div className={styles.phase3MigrationBanner} role="status" aria-label="mid-bootstrap schema revision">
          <h3>Mid-bootstrap schema revision check</h3>
          <p>15 own-papers ingested. This is the last opportunity to migrate the schema before Phase 5.</p>
          <ul>
            <li>Run revision now to fix consistent schema problems observed so far.</li>
            <li>Skip to lock schema_version for the remainder of the bootstrap.</li>
          </ul>
          <div className={styles.bootstrapRowActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => onTakeMidBootstrapSchemaRevision?.()}>
              Run revision
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => onSkipMidBootstrapSchemaRevision?.()}>
              Skip — schema is good
            </button>
          </div>
        </div>
      )}

      {isPhase3 && costProjection?.over_budget && (
        <div className={styles.phase3CostWarning} role="alert">
          Projected cost ${costProjection.projected_total_usd.toFixed(2)} exceeds Phase 3 upper bound (${costProjection.projection_upper_bound_usd}).
          Consider switching more tasks to Ollama-only.
        </div>
      )}

      <section className={styles.metricGrid}>
        {Object.entries(thresholds).map(([key, threshold]) => {
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
        <h3>{isPhase3 ? 'Phase 3 spend' : 'Phase 1 spend'}</h3>
        <ul>
          <li>Total: {formatCurrency(cost.total)}</li>
          <li>Extract: {formatCurrency(cost.extract)}</li>
          <li>Verify claims: {formatCurrency(cost.verify_claims)}</li>
          <li>Apply: {formatCurrency(cost.apply)}</li>
          <li>Projected steady state (10 papers): {formatCurrency(cost.projected_steady_state_usd)}</li>
          {isPhase3 && costProjection && (
            <>
              <li>Average per paper: {formatCurrency(costProjection.average_per_paper_usd)}</li>
              <li>Projected total: {formatCurrency(costProjection.projected_total_usd)}</li>
              <li>Projection bounds: {formatCurrency(costProjection.projection_lower_bound_usd)} – {formatCurrency(costProjection.projection_upper_bound_usd)}</li>
            </>
          )}
        </ul>
      </section>

      {isPhase3 && bootstrapProgress && (
        <section aria-label="bootstrap-progress">
          <h3>Bootstrap progress</h3>
          <ul>
            <li>
              Own-papers: <strong>{bootstrapProgress.own_papers.ingested}</strong> ingested · {bootstrapProgress.own_papers.queued} queued · {bootstrapProgress.own_papers.in_progress} in progress · {bootstrapProgress.own_papers.deferred} deferred · target {bootstrapProgress.targets?.own_papers?.max ?? 30}
            </li>
            <li>
              External anchors: <strong>{bootstrapProgress.external_anchors.ingested}</strong> ingested · {bootstrapProgress.external_anchors.queued} queued · {bootstrapProgress.external_anchors.in_progress} in progress · {bootstrapProgress.external_anchors.deferred} deferred · target {bootstrapProgress.targets?.external_anchors?.max ?? 15}
            </li>
          </ul>
        </section>
      )}

      {isPhase3 && perThemeCoverage && perThemeCoverage.length > 0 && (
        <section aria-label="per-theme-coverage">
          <h3>Per-theme coverage</h3>
          <table className={styles.phase3ThemeTable}>
            <thead>
              <tr>
                <th>Theme</th>
                <th>Papers ingested</th>
                <th>Concept pages</th>
                <th>Well-supported (≥3 papers)</th>
              </tr>
            </thead>
            <tbody>
              {perThemeCoverage.map((entry) => (
                <tr key={entry.theme}>
                  <td>{entry.theme}</td>
                  <td>{entry.papers_ingested}</td>
                  <td>{entry.concept_pages}</td>
                  <td>{entry.well_supported_concept_pages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isPhase3 && crossPaperCoherence && crossPaperCoherence.entries?.length > 0 && (
        <section aria-label="cross-paper-coherence">
          <h3>Cross-paper coherence (top concepts)</h3>
          <p>
            Average supporting papers: {crossPaperCoherence.average_supporting_papers.toFixed(1)} ·
            stddev claim count: {crossPaperCoherence.stddev_claim_count.toFixed(2)}
          </p>
          <table className={styles.phase3ThemeTable}>
            <thead>
              <tr>
                <th>Concept</th>
                <th>Supporting papers</th>
                <th>Claims</th>
              </tr>
            </thead>
            <tbody>
              {crossPaperCoherence.entries.map((entry) => (
                <tr key={entry.page_id}>
                  <td>{entry.title}</td>
                  <td>{entry.supporting_papers}</td>
                  <td>{entry.claims_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
