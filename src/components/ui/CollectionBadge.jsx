import styles from './CollectionBadge.module.css'

/**
 * CollectionBadge - Visual badge for collection membership on document cards
 * Uses outlined pill style with folder icon to distinguish from filled tag badges
 */
export default function CollectionBadge({ label, color, onClick }) {
  // Build inline style for custom color
  const colorStyle = color ? {
    '--collection-color': color,
    '--collection-border': color
  } : undefined

  return (
    <button
      className={styles.badge}
      style={colorStyle}
      onClick={(e) => {
        e.stopPropagation()
        if (onClick) onClick()
      }}
      title={`Filter by collection: ${label}`}
    >
      <svg
        className={styles.icon}
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9C21 7.89543 20.1046 7 19 7H12L10 5H5C3.89543 5 3 5.89543 3 7Z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className={styles.label}>{label}</span>
    </button>
  )
}
