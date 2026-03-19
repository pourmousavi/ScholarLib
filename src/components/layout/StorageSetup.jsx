import { useState } from 'react'
import { useStorageStore } from '../../store/storageStore'
import { Btn, Spinner } from '../ui'
import styles from './StorageSetup.module.css'

export default function StorageSetup() {
  const [selectedProvider, setSelectedProvider] = useState(null)
  const selectProvider = useStorageStore((s) => s.selectProvider)
  const isConnecting = useStorageStore((s) => s.isConnecting)
  const error = useStorageStore((s) => s.error)

  const handleConnect = () => {
    if (selectedProvider) {
      selectProvider(selectedProvider)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>S</div>
          <h1 className={styles.appName}>ScholarLib</h1>
        </div>

        <p className={styles.subtitle}>
          Connect your cloud storage to get started
        </p>

        <div className={styles.providers}>
          <button
            className={`${styles.provider} ${selectedProvider === 'box' ? styles.selected : ''}`}
            onClick={() => setSelectedProvider('box')}
            disabled={isConnecting}
          >
            <span className={styles.providerIcon}>📦</span>
            <span className={styles.providerName}>Box</span>
            <span className={styles.providerDesc}>Recommended for universities</span>
          </button>

          <button
            className={`${styles.provider} ${selectedProvider === 'dropbox' ? styles.selected : ''}`}
            onClick={() => setSelectedProvider('dropbox')}
            disabled={isConnecting}
          >
            <span className={styles.providerIcon}>💧</span>
            <span className={styles.providerName}>Dropbox</span>
            <span className={styles.providerDesc}>Personal or team accounts</span>
          </button>
        </div>

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        <Btn
          gold
          onClick={handleConnect}
          disabled={!selectedProvider || isConnecting}
          style={{ width: '100%', marginTop: 24 }}
        >
          {isConnecting ? (
            <>
              <Spinner size={14} color="#0a0d12" /> Connecting...
            </>
          ) : (
            'Connect Storage'
          )}
        </Btn>

        <p className={styles.privacy}>
          Your PDFs and data are stored entirely in your chosen cloud storage.
          ScholarLib servers only log sharing activity.
        </p>
      </div>
    </div>
  )
}
