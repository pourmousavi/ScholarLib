import { useEffect, useState } from 'react'
import { PageStore } from '../../../services/wiki/PageStore'
import { QuestionClusterer } from '../../../services/wiki/questions/QuestionClusterer'
import { QuestionPromoter } from '../../../services/wiki/questions/QuestionPromoter'
import styles from '../Wiki.module.css'

export default function QuestionInbox({ adapter }) {
  const [clusters, setClusters] = useState([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!adapter) return
      const pages = await PageStore.listPages(adapter)
      const clusterer = new QuestionClusterer()
      const next = clusterer.cluster(clusterer.collectCandidates(pages))
      if (!cancelled) setClusters(next)
    }
    load()
    return () => { cancelled = true }
  }, [adapter])

  const promote = async (cluster) => {
    setStatus('Promoting...')
    try {
      await new QuestionPromoter({ adapter }).promoteCluster(cluster)
      setStatus('Promoted')
    } catch (error) {
      setStatus(error.message || 'Promotion failed')
    }
  }

  return (
    <div className={styles.inbox}>
      <div className={styles.header}>
        <div>
          <h2>Question Inbox</h2>
          <p>Review question candidates and promote useful clusters to canonical question pages.</p>
        </div>
      </div>
      {status && <p className={styles.reason}>{status}</p>}
      {clusters.length === 0 ? (
        <div className={styles.empty}>No question candidates found.</div>
      ) : (
        <div className={styles.proposalList}>
          {clusters.map(cluster => (
            <section key={cluster.id} className={styles.proposalItem}>
              <div>
                <strong>{cluster.label}</strong>
                <p>{cluster.candidates.length} candidate{cluster.candidates.length === 1 ? '' : 's'}</p>
              </div>
              <button className={styles.primaryBtn} type="button" onClick={() => promote(cluster)}>
                Promote
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
