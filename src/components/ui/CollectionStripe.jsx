import { useState } from 'react'
import styles from './CollectionStripe.module.css'

/**
 * CollectionStripe - Colored left edge bar showing collection membership
 *
 * @param {Array} collections - Array of collection objects with displayName, color, slug
 * @param {Function} onCollectionClick - Called when stripe is clicked (receives first collection slug)
 */
export default function CollectionStripe({ collections = [], onCollectionClick }) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (!collections || collections.length === 0) {
    return null
  }

  // Build gradient or solid color based on number of collections
  const getStripeStyle = () => {
    if (collections.length === 1) {
      return { backgroundColor: collections[0].color || 'var(--accent)' }
    }

    // Multiple collections: create vertical gradient
    const colors = collections.map(c => c.color || 'var(--accent)')
    const stops = colors.map((color, i) => {
      const start = (i / colors.length) * 100
      const end = ((i + 1) / colors.length) * 100
      return `${color} ${start}%, ${color} ${end}%`
    }).join(', ')

    return { background: `linear-gradient(to bottom, ${stops})` }
  }

  const handleClick = (e) => {
    e.stopPropagation()
    if (onCollectionClick && collections.length > 0) {
      onCollectionClick(collections[0].slug)
    }
  }

  const tooltipContent = collections.map(c => c.displayName).join(', ')

  return (
    <div className={styles.stripeContainer}>
      <div
        className={styles.tooltipWrapper}
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        role="button"
        tabIndex={-1}
        aria-label={`Collections: ${tooltipContent}. Click to filter.`}
      >
        <div className={styles.stripe} style={getStripeStyle()} />
        {showTooltip && (
          <div className={styles.tooltip}>
            {collections.map((collection, idx) => (
              <div key={collection.slug || idx} className={styles.tooltipItem}>
                <span
                  className={styles.tooltipSwatch}
                  style={{ backgroundColor: collection.color || 'var(--accent)' }}
                />
                <span className={styles.tooltipText}>{collection.displayName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
