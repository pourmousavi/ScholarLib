import styles from './StatusDot.module.css'

export default function StatusDot({ status = 'none' }) {
  return (
    <span
      className={`${styles.dot} ${styles[status]}`}
      aria-label={`Status: ${status}`}
    />
  )
}
