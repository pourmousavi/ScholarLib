import { useState } from 'react'
import { AliasCollisionResolver } from '../../../services/wiki/recovery/AliasCollisionResolver'
import { SidecarService } from '../../../services/wiki/SidecarService'
import { WikiStateService } from '../../../services/wiki/WikiStateService'
import styles from '../Wiki.module.css'

function pickNewerPageId(pages) {
  const sorted = [...pages].sort((a, b) => {
    const aTime = a.last_updated || a.updated_at || ''
    const bTime = b.last_updated || b.updated_at || ''
    return bTime.localeCompare(aTime)
  })
  return sorted[0]?.id || null
}

export default function AliasCollisionRecovery({ adapter, onResolved }) {
  const [conflicts, setConflicts] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const scan = async () => {
    setError(null)
    setResult(null)
    setScanning(true)
    try {
      const found = await AliasCollisionResolver.detect(adapter)
      setConflicts(found)
      if (found.length === 0) setResult('No alias collisions found. Try regenerating sidecars.')
    } catch (runError) {
      setError(runError.message || String(runError))
    } finally {
      setScanning(false)
    }
  }

  const archive = async (conflict, pageId) => {
    setError(null)
    setBusyKey(`${conflict.normalized}:${pageId}`)
    try {
      const supersededBy = pickNewerPageId(conflict.pages.filter((p) => p.id !== pageId))
      await AliasCollisionResolver.archivePage(adapter, pageId, { supersededBy })
      const remaining = await AliasCollisionResolver.detect(adapter)
      setConflicts(remaining)
      if (remaining.length === 0) setResult('All collisions resolved. Click "Regenerate sidecars and exit safety mode" to finish.')
    } catch (runError) {
      setError(runError.message || String(runError))
    } finally {
      setBusyKey(null)
    }
  }

  const finalize = async () => {
    setError(null)
    setBusyKey('finalize')
    try {
      await SidecarService.regenerate(adapter)
      await WikiStateService.clearSafetyMode(adapter)
      setResult('Sidecars regenerated and safety mode cleared.')
      if (onResolved) await onResolved()
    } catch (runError) {
      setError(runError.message || String(runError))
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section className={styles.recoveryPanel} aria-label="Alias collision recovery">
      <header>
        <h3>Alias collision recovery</h3>
        <p className={styles.recoveryReason}>
          When two non-archived wiki pages share a title or alias, sidecar regeneration fails and
          ingestion is blocked. Scan to find the offenders, then archive the stale page in each pair.
        </p>
      </header>

      <div className={styles.recoveryActions}>
        <button type="button" className={styles.secondaryBtn} disabled={scanning} onClick={scan}>
          {scanning ? 'Scanning…' : 'Scan for alias collisions'}
        </button>
        {conflicts !== null && conflicts.length === 0 && (
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={busyKey === 'finalize'}
            onClick={finalize}
          >
            {busyKey === 'finalize' ? 'Finalizing…' : 'Regenerate sidecars and exit safety mode'}
          </button>
        )}
      </div>

      {conflicts && conflicts.length > 0 && (
        <div className={styles.recoveryResult}>
          <strong>{conflicts.length} collision{conflicts.length === 1 ? '' : 's'} found</strong>
          <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 0' }}>
            {conflicts.map((conflict) => (
              <li key={conflict.normalized} style={{ marginBottom: 'var(--space-3)' }}>
                <div style={{ marginBottom: 'var(--space-1)' }}>
                  Alias: <code>{conflict.alias}</code>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {conflict.pages.map((page) => {
                    const key = `${conflict.normalized}:${page.id}`
                    return (
                      <li
                        key={page.id}
                        style={{
                          display: 'flex',
                          gap: 'var(--space-2)',
                          alignItems: 'center',
                          padding: 'var(--space-2) 0',
                          borderTop: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500 }}>{page.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {page.id} · {page.path}
                            {page.last_updated ? ` · updated ${page.last_updated}` : ''}
                            {page.scholarlib_doc_id ? ` · doc ${page.scholarlib_doc_id}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.dangerBtn}
                          disabled={busyKey === key}
                          onClick={() => archive(conflict, page.id)}
                        >
                          {busyKey === key ? 'Archiving…' : 'Archive this page'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && <p style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)' }}>{result}</p>}
      {error && <p role="alert" className={styles.editDialogError}>{error}</p>}
    </section>
  )
}
