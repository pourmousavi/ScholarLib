import styles from './OfflineBanner.module.css'

export default function OfflineBanner() {
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.icon}>⚠</span>
      <span className={styles.text}>
        Offline — changes will sync when reconnected
      </span>
    </div>
  )
}
