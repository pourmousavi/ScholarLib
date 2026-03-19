import styles from './PendingNotice.module.css'

export default function PendingNotice({ count, onIndexNow }) {
  if (count === 0) return null

  return (
    <div className={styles.notice}>
      <span className={styles.icon}>⏳</span>
      <span className={styles.text}>
        {count} document{count !== 1 ? 's' : ''} pending AI indexing
      </span>
      <button className={styles.action} onClick={onIndexNow}>
        Index now →
      </button>
    </div>
  )
}
