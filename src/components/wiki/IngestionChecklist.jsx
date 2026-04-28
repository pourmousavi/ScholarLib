import { useMemo, useState } from 'react'
import {
  CHECKLIST_STEP_NAMES,
  IngestionChecklistService,
  getSchemaIssueVocabulary,
  normalizeSchemaIssues,
} from '../../services/wiki/phase1/IngestionChecklistService'
import styles from './Wiki.module.css'

const STEP_LABELS = {
  extract: 'Extract paper',
  verify_claims: 'Verify high-impact claims',
  build_proposal: 'Build proposal',
  review: 'Human review',
  apply: 'Apply approved changes',
  sidecar_regen: 'Regenerate sidecars',
}

const STATUS_LABELS = {
  pending: 'Pending',
  running: 'Running',
  success: 'Done',
  failed: 'Failed',
}

function formatDuration(seconds) {
  if (!seconds) return '—'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = seconds / 60
  return `${minutes.toFixed(1)}m`
}

function formatCost(cost) {
  if (cost == null) return '—'
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `<$0.01`
  return `$${cost.toFixed(2)}`
}

function StepRow({ step }) {
  return (
    <li className={`${styles.checklistStep} ${styles[`status_${step.status}`] || ''}`}>
      <div className={styles.checklistStepHeader}>
        <span className={styles.checklistStepName}>{STEP_LABELS[step.name] || step.name}</span>
        <span className={`${styles.checklistStatus} ${styles[`status_${step.status}`] || ''}`}>
          {STATUS_LABELS[step.status] || step.status}
        </span>
      </div>
      <div className={styles.checklistStepMeta}>
        {step.name === 'extract' && (
          <>
            <span>Model: {step.model_used || '—'}</span>
            <span>Tokens: {step.tokens || 0}</span>
            <span>Cost: {formatCost(step.cost_usd)}</span>
            <span>Duration: {formatDuration(step.duration_seconds)}</span>
          </>
        )}
        {step.name === 'verify_claims' && (
          <>
            <span>Total: {step.claims_total || 0}</span>
            <span>Supported: {step.claims_supported || 0}</span>
            <span>Weak: {step.claims_weak || 0}</span>
            <span>Unsupported: {step.claims_unsupported || 0}</span>
            <span>Cost: {formatCost(step.cost_usd)}</span>
          </>
        )}
        {step.name === 'build_proposal' && (
          <>
            <span>Page changes: {step.page_changes_count || 0}</span>
            <span>Candidates: {step.candidates_count || 0}</span>
          </>
        )}
        {step.name === 'review' && (
          <>
            <span>Approved: {step.changes_approved || 0}</span>
            <span>Edited: {step.changes_edited || 0}</span>
            <span>Rejected: {step.changes_rejected || 0}</span>
            <span>Time: {formatDuration(step.duration_seconds_human)}</span>
          </>
        )}
        {step.name === 'apply' && (
          <>
            <span>Op: {step.op_id || '—'}</span>
            <span>Duration: {formatDuration(step.duration_seconds)}</span>
          </>
        )}
        {step.name === 'sidecar_regen' && (
          <span>Duration: {formatDuration(step.duration_seconds)}</span>
        )}
      </div>
      {step.errors?.length > 0 && (
        <ul className={styles.checklistErrors}>
          {step.errors.map((error, index) => (
            <li key={`${step.name}-error-${index}`}>{error}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function IngestionChecklist({
  checklist,
  service,
  onSaved,
  onClose,
}) {
  const [observations, setObservations] = useState(checklist.observations || '')
  const [issueTags, setIssueTags] = useState(() =>
    new Set((checklist.schema_issues_observed || []).map((entry) => entry.tag))
  )
  const [reingestion, setReingestion] = useState(Boolean(checklist.reingestion_required))
  const [isSaving, setIsSaving] = useState(false)
  const vocabulary = useMemo(getSchemaIssueVocabulary, [])

  const progress = IngestionChecklistService.computeProgress(checklist)
  const totalCost = IngestionChecklistService.totalCostUsd(checklist)
  const allDone = checklist.steps.every((step) => step.status === 'success' || step.status === 'failed')

  const toggleIssue = (tag) => {
    setIssueTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const submit = async () => {
    setIsSaving(true)
    try {
      const issues = normalizeSchemaIssues([...issueTags])
      IngestionChecklistService.recordObservations(checklist, observations, issues, reingestion)
      if (service) await service.save(checklist)
      onSaved?.(checklist)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={styles.checklist}>
      <header className={styles.checklistHeader}>
        <div>
          <h2>{checklist.paper_title || checklist.paper_id}</h2>
          <p>
            {progress.completed}/{progress.total} steps complete · running: {progress.running} · failed: {progress.failed} · cost: {formatCost(totalCost)}
          </p>
        </div>
        {onClose && (
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Close
          </button>
        )}
      </header>

      <ol className={styles.checklistList}>
        {CHECKLIST_STEP_NAMES.map((name) => {
          const step = checklist.steps.find((entry) => entry.name === name)
          return step ? <StepRow key={name} step={step} /> : null
        })}
      </ol>

      <section className={styles.checklistObservations}>
        <h3>Observations</h3>
        <textarea
          value={observations}
          onChange={(event) => setObservations(event.target.value)}
          placeholder="What surprised you in this ingestion? What did the schema fail to capture?"
          aria-label="observations"
        />
        <fieldset className={styles.checklistIssues}>
          <legend>Schema issues observed</legend>
          {vocabulary.map((tag) => (
            <label key={tag}>
              <input
                type="checkbox"
                checked={issueTags.has(tag)}
                onChange={() => toggleIssue(tag)}
                aria-label={tag}
              />
              {tag.replace(/_/g, ' ')}
            </label>
          ))}
        </fieldset>
        <label className={styles.checklistReingestion}>
          <input
            type="checkbox"
            checked={reingestion}
            onChange={(event) => setReingestion(event.target.checked)}
          />
          Reingestion required after schema fix
        </label>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={submit}
          disabled={!allDone || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save checklist'}
        </button>
      </section>
    </div>
  )
}
