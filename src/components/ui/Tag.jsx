import styles from './Tag.module.css'

export default function Tag({ label, color, onRemove }) {
  // Build inline style for custom color if provided
  const colorStyle = color ? {
    '--tag-color': color,
    '--tag-bg': `${color}20`,
    '--tag-border': `${color}40`
  } : undefined

  return (
    <span className={styles.tag} style={colorStyle}>
      {label}
      {onRemove && (
        <button
          className={styles.remove}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
