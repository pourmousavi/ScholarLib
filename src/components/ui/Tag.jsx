import styles from './Tag.module.css'

export default function Tag({ label, onRemove }) {
  return (
    <span className={styles.tag}>
      {label}
      {onRemove && (
        <button
          className={styles.remove}
          onClick={onRemove}
          aria-label={`Remove ${label}`}
        >
          ✕
        </button>
      )}
    </span>
  )
}
