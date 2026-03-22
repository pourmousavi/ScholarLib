import { useLibraryStore } from '../../store/libraryStore'
import { Tag } from '../ui'
import styles from './ActiveFilters.module.css'

/**
 * ActiveFilters - Shows active tag filters as removable chips
 */
export default function ActiveFilters() {
  const selectedTags = useLibraryStore((s) => s.selectedTags)
  const tagFilterMode = useLibraryStore((s) => s.tagFilterMode)
  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const toggleTagSelection = useLibraryStore((s) => s.toggleTagSelection)
  const clearTagFilter = useLibraryStore((s) => s.clearTagFilter)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)

  // Don't show if no tag filters active
  if (selectedTags.length === 0) {
    return null
  }

  // If viewing by tags (no folder), the header already shows tags
  // Only show this when we're filtering within a folder
  if (!selectedFolderId) {
    return null
  }

  return (
    <div className={styles.container}>
      <span className={styles.label}>Filtered by:</span>

      {selectedTags.length > 1 && (
        <span className={styles.mode}>{tagFilterMode}</span>
      )}

      {selectedTags.map(slug => {
        const tag = tagRegistry[slug]
        return (
          <Tag
            key={slug}
            label={tag?.displayName || slug}
            color={tag?.color}
            onRemove={() => toggleTagSelection(slug)}
          />
        )
      })}

      <button
        className={styles.clearAll}
        onClick={clearTagFilter}
      >
        Clear all
      </button>
    </div>
  )
}
