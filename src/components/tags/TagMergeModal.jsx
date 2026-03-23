import { useState, useMemo, useCallback } from 'react'
import Modal from '../ui/Modal'
import Btn from '../ui/Btn'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { tagService } from '../../services/tags/TagService'
import { LibraryService } from '../../services/library/LibraryService'
import styles from './TagMergeModal.module.css'

export default function TagMergeModal({ onClose }) {
  const [sourceTags, setSourceTags] = useState([])
  const [targetTag, setTargetTag] = useState(null)
  const [isMerging, setIsMerging] = useState(false)

  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const mergeTags = useLibraryStore(s => s.mergeTags)

  const adapter = useStorageStore(s => s.adapter)
  const isDemoMode = useStorageStore(s => s.isDemoMode)

  // Helper to save library after tag changes
  const saveLibrary = useCallback(async () => {
    if (isDemoMode || !adapter) return
    try {
      const { folders, documents, tagRegistry, smartCollections } = useLibraryStore.getState()
      await LibraryService.saveLibrary(adapter, {
        version: '1.0',
        folders,
        documents,
        tag_registry: tagRegistry,
        smart_collections: smartCollections
      })
    } catch (e) {
      console.error('Failed to save library:', e)
    }
  }, [adapter, isDemoMode])

  const tagsWithCounts = useMemo(() =>
    tagService.getAllTagsWithCounts(tagRegistry, documents),
    [tagRegistry, documents]
  )

  // Calculate affected document count
  const affectedCount = useMemo(() => {
    if (sourceTags.length === 0) return 0
    return Object.values(documents).filter(doc => {
      const docTags = doc.user_data?.tags || []
      return sourceTags.some(s => docTags.includes(s))
    }).length
  }, [sourceTags, documents])

  const handleMerge = async () => {
    if (!targetTag || sourceTags.length === 0) return

    setIsMerging(true)
    try {
      await mergeTags(sourceTags, targetTag)
      // Save to storage
      await saveLibrary()
      onClose()
    } finally {
      setIsMerging(false)
    }
  }

  const toggleSource = (slug) => {
    if (slug === targetTag) return // Can't select target as source
    setSourceTags(prev =>
      prev.includes(slug)
        ? prev.filter(s => s !== slug)
        : [...prev, slug]
    )
  }

  const selectTarget = (slug) => {
    // Remove from sources if it was there
    setSourceTags(prev => prev.filter(s => s !== slug))
    setTargetTag(slug)
  }

  return (
    <Modal title="Merge Tags" onClose={onClose} width={600}>
      <div className={styles.container}>
        <h2 className={styles.title}>Merge Tags</h2>
        <p className={styles.description}>
          Select source tags to merge into a target tag. Source tags will be deleted.
        </p>

        <div className={styles.columns}>
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Source Tags (will be deleted)</h4>
            <div className={styles.tagList}>
              {tagsWithCounts.map(tag => (
                <label
                  key={tag.slug}
                  className={`${styles.tagOption} ${tag.slug === targetTag ? styles.disabled : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={sourceTags.includes(tag.slug)}
                    onChange={() => toggleSource(tag.slug)}
                    disabled={tag.slug === targetTag}
                  />
                  <span
                    className={styles.colorDot}
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className={styles.tagName}>{tag.displayName}</span>
                  <span className={styles.count}>({tag.documentCount})</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.arrow}>→</div>

          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Target Tag (will keep)</h4>
            <div className={styles.tagList}>
              {tagsWithCounts.map(tag => (
                <button
                  key={tag.slug}
                  className={`${styles.targetOption} ${tag.slug === targetTag ? styles.selected : ''} ${sourceTags.includes(tag.slug) ? styles.disabled : ''}`}
                  onClick={() => selectTarget(tag.slug)}
                  disabled={sourceTags.includes(tag.slug)}
                >
                  <span
                    className={styles.colorDot}
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className={styles.tagName}>{tag.displayName}</span>
                  <span className={styles.count}>({tag.documentCount})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {sourceTags.length > 0 && targetTag && (
          <div className={styles.preview}>
            <strong>Preview:</strong> {sourceTags.length} tag{sourceTags.length !== 1 ? 's' : ''} will be merged into "{tagRegistry[targetTag]?.displayName}".
            {' '}{affectedCount} document{affectedCount !== 1 ? 's' : ''} will be updated.
          </div>
        )}

        <div className={styles.actions}>
          <Btn onClick={onClose}>Cancel</Btn>
          <button
            className={styles.dangerBtn}
            onClick={handleMerge}
            disabled={sourceTags.length === 0 || !targetTag || isMerging}
          >
            {isMerging ? 'Merging...' : 'Merge Tags'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
