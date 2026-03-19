import styles from './ConfBar.module.css'

export default function ConfBar({ value = 0 }) {
  const clampedValue = Math.max(0, Math.min(100, value))

  let color
  if (clampedValue >= 90) {
    color = 'var(--success)'
  } else if (clampedValue >= 70) {
    color = 'var(--warning)'
  } else {
    color = 'var(--error)'
  }

  return (
    <div className={styles.track} aria-label={`Confidence: ${clampedValue}%`}>
      <div
        className={styles.fill}
        style={{
          width: `${clampedValue}%`,
          background: color
        }}
      />
    </div>
  )
}
