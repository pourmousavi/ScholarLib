import { useState, useMemo } from 'react'
import Modal from '../ui/Modal'
import Btn from '../ui/Btn'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './BulkTagModal.module.css'

export default function BulkTagModal({ mode, docIds, onClose }) {
  const [selectedTag, setSelectedTag] = useState(null)
  const [isApplying, setIsApplying] = useState(false)

  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const bulkAddTag = useLibraryStore(s => s.bulkAddTag)
  const bulkRemoveTag = useLibraryStore(s => s.bulkRemoveTag)
  const clearDocSelection = useLibraryStore(s => s.clearDocSelection)

  // For remove mode, only show tags that are on at least one selected doc
  const availableTags = useMemo(() => {
    const allTags = tagService.getAllTagsWithCounts(tagRegistry, documents)

    if (mode === 'remove') {
      const tagsOnSelected = new Set()
      for (const docId of docIds) {
        const doc = documents[docId]
        for (const slug of doc?.user_data?.tags || []) {
          tagsOnSelected.add(slug)
        }
      }
      return allTags.filter(t => tagsOnSelected.has(t.slug))
    }

    return allTags
  }, [tagRegistry, documents, docIds, mode])

  const handleApply = async () => {
    if (!selectedTag) return

    setIsApplying(true)
    try {
      if (mode === 'add') {
        await bulkAddTag(selectedTag, docIds)
      } else {
        await bulkRemoveTag(selectedTag, docIds)
      }
      clearDocSelection()
      onClose()
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Modal
      title={mode === 'add' ? 'Add Tag to Documents' : 'Remove Tag from Documents'}
      onClose={onClose}
      width={400}
    >
      <div className={styles.container}>
        <h2 className={styles.title}>
          {mode === 'add' ? 'Add Tag to Documents' : 'Remove Tag from Documents'}
        </h2>

        <p className={styles.description}>
          {mode === 'add'
            ? `Select a tag to add to ${docIds.length} document${docIds.length !== 1 ? 's' : ''}:`
            : `Select a tag to remove from ${docIds.length} document${docIds.length !== 1 ? 's' : ''}:`
          }
        </p>

        <div className={styles.tagList}>
          {availableTags.map(tag => (
            <button
              key={tag.slug}
              className={`${styles.tagOption} ${selectedTag === tag.slug ? styles.selected : ''}`}
              onClick={() => setSelectedTag(tag.slug)}
            >
              <span
                className={styles.colorDot}
                style={{ backgroundColor: tag.color }}
              />
              <span className={styles.tagName}>{tag.displayName}</span>
            </button>
          ))}

          {availableTags.length === 0 && (
            <p className={styles.empty}>
              {mode === 'remove'
                ? 'Selected documents have no tags to remove.'
                : 'No tags available. Create a tag first.'
              }
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            gold={mode === 'add'}
            onClick={handleApply}
            disabled={!selectedTag || isApplying}
            className={mode === 'remove' ? styles.dangerBtn : ''}
          >
            {isApplying
              ? 'Applying...'
              : (mode === 'add' ? 'Add Tag' : 'Remove Tag')
            }
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
