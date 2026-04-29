import { useEffect, useState } from 'react'
import { PageStore } from '../../../services/wiki/PageStore'
import { QuestionClusterer } from '../../../services/wiki/questions/QuestionClusterer'
import { QuestionPromoter } from '../../../services/wiki/questions/QuestionPromoter'
import styles from '../Wiki.module.css'

export default function QuestionInbox({ adapter }) {
  const [clusters, setClusters] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!adapter) return
      setLoading(true)
      setLoadError(null)
      try {
        const pages = await PageStore.listPagesByType(adapter, 'paper')
        const clusterer = new QuestionClusterer()
        const next = clusterer.cluster(clusterer.collectCandidates(pages))
        if (!cancelled) setClusters(next)
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Failed to load question candidates')
      } finally {
        if (!cancelled) setLoading(false)
      }
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
      {loadError ? (
        <div className={styles.empty}>{loadError}</div>
      ) : loading && clusters.length === 0 ? (
        <div className={styles.empty}>Loading question candidates...</div>
      ) : clusters.length === 0 ? (
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
