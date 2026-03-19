import styles from './Spinner.module.css'

export default function Spinner({ size = 16, color = 'var(--accent)' }) {
  return (
    <span
      className={styles.spinner}
      style={{
        width: size,
        height: size,
        borderColor: `${color} transparent transparent transparent`
      }}
      aria-label="Loading"
    />
  )
}
