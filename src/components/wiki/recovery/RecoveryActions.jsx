import { useState } from 'react'
import styles from '../Wiki.module.css'

const ACTION_DESCRIPTIONS = {
  integrity_check: 'Re-run the wiki integrity check. This compares pages on disk to sidecars and surfaces drift without changing anything.',
  accept_overwrite: 'Regenerate sidecars from the current canonical state. Use only if you are confident the existing pages on disk are correct.',
  restore_latest: 'Roll affected pages back to the most recent committed operation\'s pre-trip state. Use if a partial write tripped safety mode.',
}

export default function RecoveryActions({ state, onRunIntegrityCheck, onAcceptOverwrite, onRestoreLatest }) {
  const [pendingAction, setPendingAction] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const confirmAndRun = async (action, runner) => {
    setPendingAction(null)
    setError(null)
    setResult(null)
    setIsRunning(true)
    try {
      const value = await runner()
      setResult({ action, value })
    } catch (runError) {
      setError(runError.message || String(runError))
    } finally {
      setIsRunning(false)
    }
  }

  if (!state?.safety_mode && !state?.last_integrity_check) {
    return null
  }

  return (
    <section className={styles.recoveryPanel} aria-label="Recovery actions">
      <header>
        <h3>{state?.safety_mode ? 'Wiki is in safety mode' : 'Recovery'}</h3>
        {state?.safety_reason && <p className={styles.recoveryReason}>{state.safety_reason}</p>}
      </header>
      <div className={styles.recoveryActions}>
        {onRunIntegrityCheck && (
          <button type="button" className={styles.secondaryBtn} disabled={isRunning} onClick={() => setPendingAction('integrity_check')}>
            Run integrity check
          </button>
        )}
        {onAcceptOverwrite && (
          <button type="button" className={styles.dangerBtn} disabled={isRunning} onClick={() => setPendingAction('accept_overwrite')}>
            Accept and overwrite
          </button>
        )}
        {onRestoreLatest && (
          <button type="button" className={styles.dangerBtn} disabled={isRunning} onClick={() => setPendingAction('restore_latest')}>
            Restore from latest valid op
          </button>
        )}
      </div>
      {pendingAction && (
        <div role="dialog" aria-label="Confirm recovery action" className={styles.recoveryConfirm}>
          <p>{ACTION_DESCRIPTIONS[pendingAction]}</p>
          <p>Are you sure?</p>
          <div className={styles.recoveryConfirmActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setPendingAction(null)}>Cancel</button>
            {pendingAction === 'integrity_check' && (
              <button type="button" className={styles.primaryBtn} onClick={() => confirmAndRun('integrity_check', onRunIntegrityCheck)}>
                Run integrity check
              </button>
            )}
            {pendingAction === 'accept_overwrite' && (
              <button type="button" className={styles.dangerBtn} onClick={() => confirmAndRun('accept_overwrite', onAcceptOverwrite)}>
                Yes, overwrite
              </button>
            )}
            {pendingAction === 'restore_latest' && (
              <button type="button" className={styles.dangerBtn} onClick={() => confirmAndRun('restore_latest', onRestoreLatest)}>
                Yes, restore
              </button>
            )}
          </div>
        </div>
      )}
      {result && (
        <div className={styles.recoveryResult}>
          <strong>{result.action} result</strong>
          <pre>{JSON.stringify(result.value, null, 2)}</pre>
        </div>
      )}
      {error && <p role="alert" className={styles.editDialogError}>{error}</p>}
    </section>
  )
}
