import { useMemo, useState } from 'react'
import styles from '../Wiki.module.css'

function FrontmatterTable({ changes }) {
  if (!changes || changes.length === 0) return null
  return (
    <table className={styles.diffFmTable}>
      <thead>
        <tr><th>Field</th><th>Op</th><th>Before</th><th>After</th></tr>
      </thead>
      <tbody>
        {changes.map((change) => (
          <tr key={change.field}>
            <td>{change.field}</td>
            <td>{change.operation}</td>
            <td>{Array.isArray(change.before) ? change.before.join(', ') : String(change.before ?? '')}</td>
            <td>{Array.isArray(change.after) ? change.after.join(', ') : String(change.after ?? '')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BodyDiff({ ops, showOnlyChanges }) {
  const filtered = showOnlyChanges ? ops.filter((entry) => entry.type !== 'unchanged') : ops
  if (filtered.length === 0) {
    return <p className={styles.diffEmpty}>No body changes.</p>
  }
  return (
    <pre className={styles.diffBody}>
      {filtered.map((entry, index) => (
        <div key={index} className={`${styles.diffLine} ${styles[`diffLine_${entry.type}`]}`}>
          <span className={styles.diffPrefix}>
            {entry.type === 'inserted' ? '+' : entry.type === 'deleted' ? '−' : ' '}
          </span>
          <span>{entry.text || ' '}</span>
        </div>
      ))}
    </pre>
  )
}

function WikilinkChanges({ additions, removals, pagesById }) {
  if ((additions?.length || 0) === 0 && (removals?.length || 0) === 0) return null
  const renderLink = (id) => {
    const page = pagesById?.[id]
    return page?.title ? `${page.title} (${id})` : id
  }
  return (
    <div className={styles.diffLinks}>
      {additions?.length > 0 && (
        <div>
          <strong>Wikilinks added:</strong>
          <ul>{additions.map((id) => <li key={id} className={styles.diffLinkAdded}>{renderLink(id)}</li>)}</ul>
        </div>
      )}
      {removals?.length > 0 && (
        <div>
          <strong>Wikilinks removed:</strong>
          <ul>{removals.map((id) => <li key={id} className={styles.diffLinkRemoved}>{renderLink(id)}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

function ClaimChanges({ additions, modifications, removals }) {
  const total = (additions?.length || 0) + (modifications?.length || 0) + (removals?.length || 0)
  if (total === 0) return null
  return (
    <div className={styles.diffClaims}>
      {additions?.length > 0 && (
        <details open>
          <summary>+ {additions.length} claim{additions.length === 1 ? '' : 's'} added</summary>
          {additions.map((claim, index) => (
            <article key={`add_${index}`} className={styles.diffClaimCard}>
              <p>{claim.claim_text}</p>
              {claim.verifier_status && <small>Verifier: {claim.verifier_status}</small>}
            </article>
          ))}
        </details>
      )}
      {modifications?.length > 0 && (
        <details>
          <summary>{modifications.length} claim modification{modifications.length === 1 ? '' : 's'}</summary>
          {modifications.map((entry, index) => (
            <article key={`mod_${index}`} className={styles.diffClaimCard}>
              <p>{entry.before?.claim_text}</p>
            </article>
          ))}
        </details>
      )}
      {removals?.length > 0 && (
        <details>
          <summary>{removals.length} claim removal{removals.length === 1 ? '' : 's'}</summary>
          {removals.map((claim, index) => (
            <article key={`rm_${index}`} className={styles.diffClaimCard}>
              <p>{claim.claim_text}</p>
            </article>
          ))}
        </details>
      )}
    </div>
  )
}

export default function PageDiffView({ diff, pagesById = {}, defaultShowOnlyChanges = false }) {
  const [showOnlyChanges, setShowOnlyChanges] = useState(defaultShowOnlyChanges)
  const totals = diff?.totals || { lines_added: 0, lines_removed: 0 }
  const summary = useMemo(() => {
    const parts = []
    if (totals.lines_added) parts.push(`+${totals.lines_added}`)
    if (totals.lines_removed) parts.push(`−${totals.lines_removed}`)
    if (totals.frontmatter_field_changes) parts.push(`${totals.frontmatter_field_changes} fm`)
    if (totals.wikilinks_added || totals.wikilinks_removed) parts.push(`${totals.wikilinks_added} link+ / ${totals.wikilinks_removed} link−`)
    return parts.join(' · ') || 'No changes'
  }, [totals])

  if (!diff) return null

  return (
    <div className={styles.pageDiff}>
      <div className={styles.pageDiffHeader}>
        <span className={styles.pageDiffSummary}>{summary}</span>
        <label className={styles.pageDiffToggle}>
          <input type="checkbox" checked={showOnlyChanges} onChange={(event) => setShowOnlyChanges(event.target.checked)} />
          <span>Show only changes</span>
        </label>
      </div>
      <FrontmatterTable changes={diff.frontmatter_changes} />
      <BodyDiff ops={diff.body_changes} showOnlyChanges={showOnlyChanges} />
      <WikilinkChanges additions={diff.wikilink_additions} removals={diff.wikilink_removals} pagesById={pagesById} />
      <ClaimChanges
        additions={diff.claim_additions}
        modifications={diff.claim_modifications}
        removals={diff.claim_removals}
      />
    </div>
  )
}
