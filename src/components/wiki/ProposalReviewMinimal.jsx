import { useMemo, useState } from 'react'
import { ProposalApplier } from '../../services/wiki'
import PageReader from './PageReader'
import styles from './Wiki.module.css'

export default function ProposalReviewMinimal({ proposal, adapter, onApplied, onClose }) {
  const [selected, setSelected] = useState(() => new Set(proposal.page_changes.map((change) => change.change_id)))
  const [edits, setEdits] = useState({})
  const [editing, setEditing] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const unsupported = proposal.page_changes.flatMap((change) => change.claims_added_unsupported || [])
  const lowRiskIds = useMemo(() => proposal.page_changes.filter((change) => change.risk_tier === 'low').map((change) => change.change_id), [proposal])

  const toggle = (changeId, checked) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(changeId)
      else next.delete(changeId)
      return next
    })
  }

  const approveLowRisk = () => {
    setSelected(new Set(lowRiskIds))
  }

  const submit = async () => {
    setIsSubmitting(true)
    try {
      const applier = new ProposalApplier({ adapter })
      await applier.applyProposal(proposal.proposal_id, {
        mode: 'selected',
        selected_change_ids: [...selected],
        per_change_edits: edits,
      })
      onApplied?.()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.review}>
      <div className={styles.reviewHeader}>
        <div>
          <h2>{proposal.source?.title || 'Wiki Proposal'}</h2>
          <p>{proposal.source?.doi || proposal.source?.scholarlib_doc_id}</p>
        </div>
        <button className={styles.secondaryBtn} onClick={onClose}>Back</button>
      </div>

      <div className={styles.actions}>
        <button className={styles.secondaryBtn} onClick={approveLowRisk}>Approve all low-risk</button>
        <button className={styles.primaryBtn} disabled={isSubmitting} onClick={submit}>
          {isSubmitting ? 'Applying...' : 'Submit approval'}
        </button>
      </div>

      {proposal.page_changes.map((change) => (
        <section key={change.change_id} className={styles.change}>
          <div className={styles.changeHeader}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(change.change_id)}
                onChange={(event) => toggle(change.change_id, event.target.checked)}
              />
              <span>{change.page_type} · {change.operation}</span>
            </label>
            <span className={`${styles.tier} ${styles[change.risk_tier]}`}>{change.risk_tier}</span>
          </div>
          <p className={styles.reason}>{change.risk_reason}</p>
          <div className={styles.diff}>
            <div>
              <h4>Existing</h4>
              <pre>{change.expected_base_hash ? 'Existing page loaded at approval time' : 'New page'}</pre>
            </div>
            <div>
              <h4>Proposed</h4>
              {editing === change.change_id ? (
                <textarea
                  value={edits[change.change_id]?.edited_body ?? change.draft_body}
                  onChange={(event) => setEdits((prev) => ({
                    ...prev,
                    [change.change_id]: {
                      edited_frontmatter: change.draft_frontmatter,
                      edited_body: event.target.value,
                    },
                  }))}
                />
              ) : (
                <PageReader body={change.draft_body} />
              )}
            </div>
          </div>
          <button className={styles.secondaryBtn} onClick={() => setEditing(editing === change.change_id ? null : change.change_id)}>
            {editing === change.change_id ? 'Preview' : 'Edit'}
          </button>
          {change.claims_added?.length > 0 && (
            <details className={styles.evidence}>
              <summary>Show evidence</summary>
              {change.claims_added.map((claim, index) => (
                <div key={`${claim.claim_text}-${index}`}>
                  <strong>{claim.claim_text}</strong>
                  <p>{claim.supported_by?.[0]?.quote_snippet || 'Snippet unavailable'}</p>
                </div>
              ))}
            </details>
          )}
        </section>
      ))}

      {unsupported.length > 0 && (
        <section className={styles.unsupported}>
          <h3>Unsupported claims</h3>
          {unsupported.map((claim, index) => (
            <p key={`${claim.claim_text}-${index}`}>{claim.claim_text}</p>
          ))}
        </section>
      )}
    </div>
  )
}
