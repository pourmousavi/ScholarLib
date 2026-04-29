import { useEffect, useState } from 'react'
import { PageStore } from '../../../services/wiki/PageStore'
import styles from '../Wiki.module.css'

export default function GrantPanel({ adapter }) {
  const [grants, setGrants] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!adapter) return
      const pages = await PageStore.listPages(adapter)
      if (!cancelled) setGrants(pages.filter(page => page.frontmatter?.type === 'grant'))
    }
    load()
    return () => { cancelled = true }
  }, [adapter])

  const selected = grants.find(grant => grant.id === selectedId) || grants[0]
  const grouped = grants.reduce((acc, grant) => {
    const key = grant.frontmatter?.outcome || 'pending'
    acc[key] ||= []
    acc[key].push(grant)
    return acc
  }, {})

  return (
    <div className={styles.inbox}>
      <div className={styles.header}>
        <div>
          <h2>Grants</h2>
          <p>Private grant namespace. Cloud providers are blocked for this content.</p>
        </div>
      </div>

      {grants.length === 0 ? (
        <div className={styles.empty}>No grant pages found.</div>
      ) : (
        <div className={styles.diff}>
          <div>
            {Object.entries(grouped).map(([outcome, rows]) => (
              <section key={outcome} className={styles.change}>
                <h3>{outcome}</h3>
                {rows.map(grant => (
                  <button key={grant.id} className={styles.proposalItem} type="button" onClick={() => setSelectedId(grant.id)}>
                    <span>{grant.frontmatter?.title || grant.id}</span>
                    <span>{grant.frontmatter?.submitted || ''}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>
          {selected && (
            <article className={styles.change}>
              <h3>{selected.frontmatter?.title}</h3>
              <p>{selected.frontmatter?.funder} {selected.frontmatter?.program}</p>
              <p>Outcome: {selected.frontmatter?.outcome}</p>
              <pre>{selected.body}</pre>
            </article>
          )}
        </div>
      )}
    </div>
  )
}
