import { useCallback, useEffect, useState } from 'react'
import { useStorageStore } from '../../store/storageStore'
import { ProposalStore, WikiService } from '../../services/wiki'
import ProposalReviewMinimal from './ProposalReviewMinimal'
import styles from './Wiki.module.css'

export default function Inbox() {
  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)
  const [proposals, setProposals] = useState([])
  const [status, setStatus] = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    if (!adapter || isDemoMode) return
    const store = new ProposalStore(adapter)
    setProposals(await store.listPending())
    setStatus(await WikiService.getStatus(adapter))
  }, [adapter, isDemoMode])

  useEffect(() => {
    load()
  }, [load])

  if (!adapter || isDemoMode) {
    return <div className={styles.inbox}><h2>Wiki</h2><p>Wiki requires connected storage.</p></div>
  }

  if (selected) {
    return (
      <ProposalReviewMinimal
        proposal={selected}
        adapter={adapter}
        onClose={() => setSelected(null)}
        onApplied={() => {
          setSelected(null)
          load()
        }}
      />
    )
  }

  return (
    <div className={styles.inbox}>
      <div className={styles.header}>
        <div>
          <h2>Wiki</h2>
          <p>{status?.state?.safety_mode ? 'Safety mode' : 'Normal'} · {proposals.length} pending proposal{proposals.length === 1 ? '' : 's'}</p>
        </div>
        <button className={styles.secondaryBtn} onClick={load}>Refresh</button>
      </div>

      {proposals.length === 0 ? (
        <div className={styles.empty}>No pending wiki proposals.</div>
      ) : (
        <div className={styles.proposalList}>
          {proposals.map((proposal) => (
            <button key={proposal.proposal_id} className={styles.proposalItem} onClick={() => setSelected(proposal)}>
              <span>{proposal.source?.title || proposal.proposal_id}</span>
              <small>{proposal.page_changes?.length || 0} change{proposal.page_changes?.length === 1 ? '' : 's'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
