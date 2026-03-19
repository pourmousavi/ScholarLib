import styles from './IOSInstallPrompt.module.css'

export default function IOSInstallPrompt({ onDismiss }) {
  return (
    <div className={styles.prompt}>
      <div className={styles.content}>
        <div className={styles.icon}>S</div>
        <div className={styles.text}>
          <strong>Install ScholarLib</strong>
          <span>Tap <span className={styles.shareIcon}>⬆</span> then "Add to Home Screen"</span>
        </div>
        <button
          className={styles.dismissBtn}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      <div className={styles.arrow} />
    </div>
  )
}
