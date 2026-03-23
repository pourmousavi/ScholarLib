import { useState, useMemo } from 'react'
import Modal from '../ui/Modal'
import Btn from '../ui/Btn'
import { useLibraryStore } from '../../store/libraryStore'
import { collectionService } from '../../services/tags/CollectionService'
import styles from './TagMergeModal.module.css'

/**
 * CollectionMergeModal - Merge multiple collections into one
 * Target collection gets all tags from source collections (deduplicated)
 */
export default function CollectionMergeModal({ onClose, onSave }) {
  const [sourceCollections, setSourceCollections] = useState([])
  const [targetCollection, setTargetCollection] = useState(null)
  const [isMerging, setIsMerging] = useState(false)

  const collectionRegistry = useLibraryStore(s => s.collectionRegistry)
  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const mergeCollections = useLibraryStore(s => s.mergeCollections)

  const collectionsWithCounts = useMemo(() =>
    collectionService.getAllCollectionsWithCounts(collectionRegistry, tagRegistry, documents),
    [collectionRegistry, tagRegistry, documents]
  )

  // Calculate merged tag count
  const mergedTagCount = useMemo(() => {
    if (sourceCollections.length === 0 || !targetCollection) return 0

    const allTags = new Set(collectionRegistry[targetCollection]?.tags || [])
    for (const slug of sourceCollections) {
      for (const tag of collectionRegistry[slug]?.tags || []) {
        allTags.add(tag)
      }
    }
    return allTags.size
  }, [sourceCollections, targetCollection, collectionRegistry])

  const handleMerge = async () => {
    if (!targetCollection || sourceCollections.length === 0) return

    setIsMerging(true)
    try {
      const result = mergeCollections(sourceCollections, targetCollection)
      if (result.error) {
        console.error('Failed to merge collections:', result.error)
        return
      }
      // Save to storage
      if (onSave) await onSave()
      onClose()
    } finally {
      setIsMerging(false)
    }
  }

  const toggleSource = (slug) => {
    if (slug === targetCollection) return // Can't select target as source
    setSourceCollections(prev =>
      prev.includes(slug)
        ? prev.filter(s => s !== slug)
        : [...prev, slug]
    )
  }

  const selectTarget = (slug) => {
    // Remove from sources if it was there
    setSourceCollections(prev => prev.filter(s => s !== slug))
    setTargetCollection(slug)
  }

  return (
    <Modal title="Merge Collections" onClose={onClose} width={600}>
      <div className={styles.container}>
        <h2 className={styles.title}>Merge Collections</h2>
        <p className={styles.description}>
          Select source collections to merge into a target collection.
          Source collections will be deleted; their tags will be added to the target.
        </p>

        <div className={styles.columns}>
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Source Collections (will be deleted)</h4>
            <div className={styles.tagList}>
              {collectionsWithCounts.map(collection => (
                <label
                  key={collection.slug}
                  className={`${styles.tagOption} ${collection.slug === targetCollection ? styles.disabled : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={sourceCollections.includes(collection.slug)}
                    onChange={() => toggleSource(collection.slug)}
                    disabled={collection.slug === targetCollection}
                  />
                  <span
                    className={styles.colorDot}
                    style={{ backgroundColor: collection.color }}
                  />
                  <span className={styles.tagName}>{collection.displayName}</span>
                  <span className={styles.count}>({collection.tagCount} tags)</span>
                </label>
              ))}
              {collectionsWithCounts.length === 0 && (
                <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No collections available
                </div>
              )}
            </div>
          </div>

          <div className={styles.arrow}>→</div>

          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Target Collection (will keep)</h4>
            <div className={styles.tagList}>
              {collectionsWithCounts.map(collection => (
                <button
                  key={collection.slug}
                  className={`${styles.targetOption} ${collection.slug === targetCollection ? styles.selected : ''} ${sourceCollections.includes(collection.slug) ? styles.disabled : ''}`}
                  onClick={() => selectTarget(collection.slug)}
                  disabled={sourceCollections.includes(collection.slug)}
                >
                  <span
                    className={styles.colorDot}
                    style={{ backgroundColor: collection.color }}
                  />
                  <span className={styles.tagName}>{collection.displayName}</span>
                  <span className={styles.count}>({collection.tagCount} tags)</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {sourceCollections.length > 0 && targetCollection && (
          <div className={styles.preview}>
            <strong>Preview:</strong> {sourceCollections.length} collection{sourceCollections.length !== 1 ? 's' : ''} will be merged into "{collectionRegistry[targetCollection]?.displayName}".
            {' '}The target will have {mergedTagCount} tag{mergedTagCount !== 1 ? 's' : ''} total.
          </div>
        )}

        <div className={styles.actions}>
          <Btn onClick={onClose}>Cancel</Btn>
          <button
            className={styles.dangerBtn}
            onClick={handleMerge}
            disabled={sourceCollections.length === 0 || !targetCollection || isMerging}
          >
            {isMerging ? 'Merging...' : 'Merge Collections'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
