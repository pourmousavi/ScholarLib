import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProposalReviewSubmitter } from '../../services/wiki'
import { PageDiffer } from '../../services/wiki/diff/PageDiffer'
import { PageStore } from '../../services/wiki/PageStore'
import { STORAGE_ERRORS } from '../../services/storage/StorageAdapter'
import { authorDisplay } from '../../utils/authorDisplay'
import ProposalHeader from './proposalReview/ProposalHeader'
import RiskTierSection from './proposalReview/RiskTierSection'
import PageDiffView from './proposalReview/PageDiffView'
import SourceEvidencePopover from './proposalReview/SourceEvidencePopover'
import ChangeEditDialog from './proposalReview/ChangeEditDialog'
import styles from './Wiki.module.css'

const DEFAULT_AUDIT_SAMPLE_RATIO = 0.2

function pickAuditSample(changes, ratio = DEFAULT_AUDIT_SAMPLE_RATIO) {
  if (changes.length === 0) return new Set()
  const target = Math.max(1, Math.ceil(changes.length * ratio))
  const ids = changes.map((change) => change.change_id)
  const sample = new Set()
  const pool = [...ids]
  while (sample.size < target && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    sample.add(pool.splice(index, 1)[0])
  }
  return sample
}

function defaultDecisions(changes) {
  const map = {}
  for (const change of changes) {
    if (change.risk_tier === 'low') map[change.change_id] = 'approved'
    else if (change.risk_tier === 'medium') map[change.change_id] = 'approved'
    else map[change.change_id] = 'pending'
  }
  return map
}

function tierTotalsOf(changes) {
  const totals = { low: 0, medium: 0, high: 0 }
  for (const change of changes) {
    const tier = change.risk_tier || 'low'
    if (totals[tier] != null) totals[tier] += 1
  }
  return totals
}

function evidenceForChange(change) {
  return [
    ...(change.claims_added || []),
    ...(change.claims_modified || []),
    ...(change.claims_added_unsupported || []),
  ]
}

const SHORTCUT_HINTS = [
  ['j', 'next change'],
  ['k', 'previous change'],
  ['a', 'approve current'],
  ['r', 'reject current'],
  ['e', 'edit current'],
  ['s', 'toggle source evidence'],
  ['Enter', 'submit'],
  ['?', 'show shortcuts'],
]

export default function ProposalReview({ proposal, adapter, onApplied, onClose, onOpenPdf }) {
  const allChanges = proposal?.page_changes || []
  const [decisions, setDecisions] = useState(() => defaultDecisions(allChanges))
  const [edits, setEdits] = useState({})
  const [editingChangeId, setEditingChangeId] = useState(null)
  const [evidenceFor, setEvidenceFor] = useState(null)
  const [shortcutHelp, setShortcutHelp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [currentPages, setCurrentPages] = useState({})
  const reviewStartRef = useRef(new Date().toISOString())
  const startTimeMs = useRef(Date.now())
  const [focusedChangeId, setFocusedChangeId] = useState(allChanges[0]?.change_id || null)
  const containerRef = useRef(null)

  const tierTotals = useMemo(() => tierTotalsOf(allChanges), [allChanges])
  const auditSample = useMemo(() => pickAuditSample(allChanges.filter((change) => change.risk_tier === 'low')), [allChanges])

  const differ = useMemo(() => new PageDiffer(), [])

  useEffect(() => {
    if (!adapter || !proposal) return
    let cancelled = false
    async function loadPages() {
      const next = {}
      for (const change of allChanges) {
        if (change.operation !== 'modify') continue
        try {
          next[change.change_id] = await PageStore.readPage(adapter, change.page_id)
        } catch (error) {
          if (error.code !== STORAGE_ERRORS.NOT_FOUND) console.warn('Failed to load existing page', error)
        }
      }
      if (!cancelled) setCurrentPages(next)
    }
    loadPages()
    return () => { cancelled = true }
  }, [adapter, proposal, allChanges])

  const diffByChangeId = useMemo(() => {
    const map = {}
    for (const change of allChanges) {
      const current = currentPages[change.change_id] || null
      const edited = edits[change.change_id]
      const fm = edited?.edited_frontmatter || change.draft_frontmatter
      const body = edited?.edited_body || change.draft_body
      const diff = differ.diff(current, fm, body)
      map[change.change_id] = <PageDiffView diff={diff} />
    }
    return map
  }, [allChanges, currentPages, edits, differ])

  const evidenceByChangeId = useMemo(() => {
    const map = {}
    for (const change of allChanges) {
      map[change.change_id] = evidenceForChange(change)
    }
    return map
  }, [allChanges])

  const setDecision = useCallback((changeId, value) => {
    setDecisions((prev) => ({ ...prev, [changeId]: value }))
  }, [])

  const approveTier = useCallback((tier) => {
    setDecisions((prev) => {
      const next = { ...prev }
      for (const change of allChanges) {
        if (change.risk_tier === tier) next[change.change_id] = 'approved'
      }
      return next
    })
  }, [allChanges])

  const rejectTier = useCallback((tier) => {
    setDecisions((prev) => {
      const next = { ...prev }
      for (const change of allChanges) {
        if (change.risk_tier === tier) next[change.change_id] = 'rejected'
      }
      return next
    })
  }, [allChanges])

  const orderedIds = useMemo(() => allChanges.map((change) => change.change_id), [allChanges])
  const focusIndex = orderedIds.indexOf(focusedChangeId)

  const move = useCallback((delta) => {
    if (orderedIds.length === 0) return
    const next = (focusIndex + delta + orderedIds.length) % orderedIds.length
    setFocusedChangeId(orderedIds[next])
    const node = containerRef.current?.querySelector(`[data-change-id="${orderedIds[next]}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [orderedIds, focusIndex])

  const handleEdit = useCallback((changeId) => setEditingChangeId(changeId), [])
  const handleEditSave = useCallback((payload) => {
    if (!editingChangeId) return
    setEdits((prev) => ({ ...prev, [editingChangeId]: payload }))
    setEditingChangeId(null)
  }, [editingChangeId])

  const handleShowEvidence = useCallback((changeId, claim) => {
    setEvidenceFor((prev) => (prev?.changeId === changeId && prev?.claim === claim ? null : { changeId, claim }))
  }, [])

  useEffect(() => {
    function onKey(event) {
      if (editingChangeId) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'j') { event.preventDefault(); move(1) }
      else if (event.key === 'k') { event.preventDefault(); move(-1) }
      else if (event.key === 'a' && focusedChangeId) {
        event.preventDefault()
        const change = allChanges.find((entry) => entry.change_id === focusedChangeId)
        if (change && change.risk_tier !== 'high') setDecision(focusedChangeId, 'approved')
      }
      else if (event.key === 'r' && focusedChangeId) {
        event.preventDefault()
        setDecision(focusedChangeId, 'rejected')
      }
      else if (event.key === 'e' && focusedChangeId) {
        event.preventDefault()
        setEditingChangeId(focusedChangeId)
      }
      else if (event.key === 's' && focusedChangeId) {
        event.preventDefault()
        const change = allChanges.find((entry) => entry.change_id === focusedChangeId)
        const claim = evidenceForChange(change || {})[0]
        if (claim) handleShowEvidence(focusedChangeId, claim)
      }
      else if (event.key === '?') {
        event.preventDefault()
        setShortcutHelp((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingChangeId, focusedChangeId, move, setDecision, allChanges, handleShowEvidence])

  const submit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    const approved = []
    const rejected = []
    for (const change of allChanges) {
      const decision = decisions[change.change_id]
      if (decision === 'approved') approved.push(change.change_id)
      else if (decision === 'rejected') rejected.push(change.change_id)
    }
    try {
      const submitter = new ProposalReviewSubmitter({ adapter })
      const endedAt = new Date().toISOString()
      const durationSeconds = Math.max(1, Math.round((Date.now() - startTimeMs.current) / 1000))
      const result = await submitter.submit({
        proposalId: proposal.proposal_id,
        approvedChangeIds: approved,
        rejectedChangeIds: rejected,
        perChangeEdits: edits,
        reviewTracking: { startedAt: reviewStartRef.current, endedAt, durationSeconds },
      })
      onApplied?.(result)
    } catch (error) {
      setSubmitError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const rejectEntireProposal = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const submitter = new ProposalReviewSubmitter({ adapter })
      const result = await submitter.submit({
        proposalId: proposal.proposal_id,
        approvedChangeIds: [],
        rejectAll: true,
      })
      onApplied?.(result)
    } catch (error) {
      setSubmitError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const editingChange = editingChangeId ? allChanges.find((change) => change.change_id === editingChangeId) : null
  const candidateRecords = proposal?.candidate_records || {}
  const candidateCount = (candidateRecords.question_candidates?.length || 0)
    + (candidateRecords.author_entries?.length || 0)
    + (candidateRecords.contradiction_signals?.length || 0)

  const unsupportedClaims = allChanges.flatMap((change) => change.claims_added_unsupported || [])

  const summary = useMemo(() => {
    const counts = { approved: 0, rejected: 0, pending: 0 }
    for (const change of allChanges) {
      counts[decisions[change.change_id] || 'pending'] += 1
    }
    return counts
  }, [allChanges, decisions])

  const groupedChanges = useMemo(() => {
    const groups = { high: [], medium: [], low: [] }
    for (const change of allChanges) groups[change.risk_tier || 'low']?.push(change)
    return groups
  }, [allChanges])

  return (
    <div className={styles.review} ref={containerRef}>
      <ProposalHeader
        proposal={proposal}
        tierTotals={tierTotals}
        onClose={onClose}
        onOpenPdf={onOpenPdf}
        onRejectAll={rejectEntireProposal}
      />

      <div className={styles.shortcutsHint} aria-hidden="true">
        Shortcuts: j/k move · a approve · r reject · e edit · s evidence · ? help
      </div>

      <RiskTierSection
        tier="high"
        changes={groupedChanges.high}
        decisions={decisions}
        focusedChangeId={focusedChangeId}
        auditSampleIds={null}
        defaultExpanded
        diffByChangeId={diffByChangeId}
        evidenceByChangeId={evidenceByChangeId}
        onApprove={(id) => setDecision(id, 'approved')}
        onReject={(id) => setDecision(id, 'rejected')}
        onEdit={handleEdit}
        onShowEvidence={handleShowEvidence}
        onFocus={setFocusedChangeId}
        onRejectAll={rejectTier}
      />

      <RiskTierSection
        tier="medium"
        changes={groupedChanges.medium}
        decisions={decisions}
        focusedChangeId={focusedChangeId}
        auditSampleIds={null}
        defaultExpanded
        diffByChangeId={diffByChangeId}
        evidenceByChangeId={evidenceByChangeId}
        onApprove={(id) => setDecision(id, 'approved')}
        onReject={(id) => setDecision(id, 'rejected')}
        onEdit={handleEdit}
        onShowEvidence={handleShowEvidence}
        onFocus={setFocusedChangeId}
        onApproveAll={approveTier}
        onRejectAll={rejectTier}
      />

      <RiskTierSection
        tier="low"
        changes={groupedChanges.low}
        decisions={decisions}
        focusedChangeId={focusedChangeId}
        auditSampleIds={auditSample}
        defaultExpanded={false}
        diffByChangeId={diffByChangeId}
        evidenceByChangeId={evidenceByChangeId}
        onApprove={(id) => setDecision(id, 'approved')}
        onReject={(id) => setDecision(id, 'rejected')}
        onEdit={handleEdit}
        onShowEvidence={handleShowEvidence}
        onFocus={setFocusedChangeId}
        onApproveAll={approveTier}
        onRejectAll={rejectTier}
      />

      {unsupportedClaims.length > 0 && (
        <section className={`${styles.tierSection} ${styles.tierSectionHigh}`} aria-label="Unsupported claims">
          <header className={styles.tierSectionHeader}>
            <h3>Unsupported claims (verifier rejected)</h3>
            <span className={styles.tierSectionCount}>{unsupportedClaims.length} item{unsupportedClaims.length === 1 ? '' : 's'}</span>
          </header>
          <ul className={styles.unsupportedList}>
            {unsupportedClaims.map((claim, index) => (
              <li key={`${claim.claim_text}-${index}`}>
                <strong>{claim.claim_text}</strong>
                <small>{claim.verifier?.justification || 'No justification recorded'}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {candidateCount > 0 && (
        <section className={styles.tierSection} aria-label="Candidate records">
          <header className={styles.tierSectionHeader}>
            <h3>Candidate records</h3>
            <span className={styles.tierSectionCount}>{candidateCount} item{candidateCount === 1 ? '' : 's'}</span>
          </header>
          <details>
            <summary>Show candidate questions, authors, contradictions</summary>
            {candidateRecords.question_candidates?.length > 0 && (
              <div>
                <strong>Question candidates</strong>
                <ul>{candidateRecords.question_candidates.map((entry, index) => <li key={index}>{entry.candidate_question}</li>)}</ul>
              </div>
            )}
            {candidateRecords.author_entries?.length > 0 && (
              <div>
                <strong>Author entries</strong>
                <ul>{candidateRecords.author_entries.map((entry, index) => <li key={index}>{authorDisplay(entry)}</li>)}</ul>
              </div>
            )}
            {candidateRecords.contradiction_signals?.length > 0 && (
              <div>
                <strong>Contradiction signals</strong>
                <ul>{candidateRecords.contradiction_signals.map((entry, index) => <li key={index}>{entry.summary || entry.note || JSON.stringify(entry)}</li>)}</ul>
              </div>
            )}
          </details>
        </section>
      )}

      <footer className={styles.reviewFooter}>
        <div className={styles.reviewFooterSummary}>
          <span>{summary.approved} approved · {summary.rejected} rejected · {summary.pending} pending</span>
          {Number.isFinite(proposal?.extraction_metadata?.cost_usd) && (
            <span>Extraction cost ${Number(proposal.extraction_metadata.cost_usd).toFixed(3)}</span>
          )}
        </div>
        {submitError && <p role="alert" className={styles.editDialogError}>{submitError}</p>}
        <div className={styles.reviewFooterActions}>
          <button type="button" className={styles.dangerBtn} onClick={rejectEntireProposal} disabled={submitting}>
            Reject entire proposal
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={submit}
            disabled={submitting || summary.approved === 0}
          >
            {submitting ? 'Submitting…' : `Submit ${summary.approved} approval${summary.approved === 1 ? '' : 's'}`}
          </button>
        </div>
      </footer>

      {shortcutHelp && (
        <div role="dialog" aria-label="Keyboard shortcuts" className={styles.shortcutHelpOverlay} onClick={() => setShortcutHelp(false)}>
          <div className={styles.shortcutHelp} onClick={(event) => event.stopPropagation()}>
            <h3>Keyboard shortcuts</h3>
            <dl>
              {SHORTCUT_HINTS.map(([key, label]) => (
                <div key={key}><dt>{key}</dt><dd>{label}</dd></div>
              ))}
            </dl>
            <button type="button" className={styles.secondaryBtn} onClick={() => setShortcutHelp(false)}>Close</button>
          </div>
        </div>
      )}

      {evidenceFor && (
        <SourceEvidencePopover
          claim={evidenceFor.claim}
          anchor={evidenceFor.changeId}
          onClose={() => setEvidenceFor(null)}
          onOpenPdf={onOpenPdf}
        />
      )}

      {editingChange && (
        <ChangeEditDialog
          change={editingChange}
          currentEdit={edits[editingChange.change_id]}
          onSave={handleEditSave}
          onCancel={() => setEditingChangeId(null)}
        />
      )}
    </div>
  )
}

export { pickAuditSample, defaultDecisions }
