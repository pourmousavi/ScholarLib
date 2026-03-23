import { useState, useMemo } from 'react'
import Modal from '../ui/Modal'
import Btn from '../ui/Btn'
import CollectionColorPicker from './CollectionColorPicker'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './CollectionEditModal.module.css'

/**
 * CollectionEditModal - Create or edit a collection
 * Collections are logical groupings of tags
 */
export default function CollectionEditModal({ slug, onClose, onSave }) {
  const collectionRegistry = useLibraryStore(s => s.collectionRegistry)
  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const createCollection = useLibraryStore(s => s.createCollection)
  const updateCollection = useLibraryStore(s => s.updateCollection)
  const deleteCollection = useLibraryStore(s => s.deleteCollection)

  const isEditing = !!slug
  const collection = slug ? collectionRegistry[slug] : null

  const [displayName, setDisplayName] = useState(collection?.displayName || '')
  const [color, setColor] = useState(collection?.color || '#7C3AED')
  const [description, setDescription] = useState(collection?.description || '')
  const [selectedTags, setSelectedTags] = useState(collection?.tags || [])
  const [tagSearch, setTagSearch] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Get all tags with counts
  const tagsWithCounts = useMemo(() => {
    return tagService.getAllTagsWithCounts(tagRegistry, documents)
  }, [tagRegistry, documents])

  // Filter tags by search
  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return tagsWithCounts
    const q = tagSearch.toLowerCase()
    return tagsWithCounts.filter(t =>
      t.displayName.toLowerCase().includes(q) ||
      t.slug.includes(q)
    )
  }, [tagsWithCounts, tagSearch])

  // Count documents in this collection
  const docCount = useMemo(() => {
    let count = 0
    for (const doc of Object.values(documents)) {
      const docTags = doc.user_data?.tags || []
      if (selectedTags.some(t => docTags.includes(t))) {
        count++
      }
    }
    return count
  }, [documents, selectedTags])

  const toggleTag = (tagSlug) => {
    setSelectedTags(prev =>
      prev.includes(tagSlug)
        ? prev.filter(t => t !== tagSlug)
        : [...prev, tagSlug]
    )
  }

  const handleSave = async () => {
    if (!displayName.trim()) return

    setIsSaving(true)
    try {
      if (isEditing) {
        const result = updateCollection(slug, {
          displayName,
          color,
          description,
          tags: selectedTags
        })
        if (result.error) {
          console.error('Failed to update collection:', result.error)
          return
        }
      } else {
        const result = await createCollection(displayName, {
          color,
          description,
          tags: selectedTags
        })
        if (result.error) {
          console.error('Failed to create collection:', result.error)
          return
        }
      }
      // Save to storage
      if (onSave) await onSave()
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = deleteCollection(slug)
      if (result.error) {
        console.error('Failed to delete collection:', result.error)
        return
      }
      // Save to storage
      if (onSave) await onSave()
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal
      title={isEditing ? 'Edit Collection' : 'Create Collection'}
      onClose={onClose}
      width={480}
    >
      <div className={styles.container}>
        <h2 className={styles.title}>
          {isEditing ? 'Edit Collection' : 'Create Collection'}
        </h2>

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input
              type="text"
              className={styles.input}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Collection name"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Color</label>
            <CollectionColorPicker value={color} onChange={setColor} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Description (optional)</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this collection for?"
              rows={2}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Tags in Collection ({selectedTags.length})
            </label>
            <div className={styles.tagSelector}>
              <input
                type="text"
                className={styles.tagSearch}
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                placeholder="Search tags..."
              />
              <div className={styles.tagList}>
                {filteredTags.length === 0 ? (
                  <div className={styles.noTags}>
                    {tagSearch ? 'No tags match your search' : 'No tags available'}
                  </div>
                ) : (
                  filteredTags.map(tag => (
                    <button
                      key={tag.slug}
                      type="button"
                      className={`${styles.tagItem} ${selectedTags.includes(tag.slug) ? styles.selected : ''}`}
                      onClick={() => toggleTag(tag.slug)}
                    >
                      <span
                        className={styles.tagColor}
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className={styles.tagName}>{tag.displayName}</span>
                      <span className={styles.tagCount}>{tag.documentCount}</span>
                      {selectedTags.includes(tag.slug) && (
                        <span className={styles.checkmark}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="2 6 5 9 10 3" />
                          </svg>
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className={styles.meta}>
            {selectedTags.length} tag{selectedTags.length !== 1 ? 's' : ''} selected,
            covering {docCount} document{docCount !== 1 ? 's' : ''}
          </div>

          <div className={styles.actions}>
            <Btn onClick={onClose}>
              Cancel
            </Btn>
            <Btn
              gold
              onClick={handleSave}
              disabled={!displayName.trim() || isSaving}
            >
              {isSaving ? 'Saving...' : isEditing ? 'Save' : 'Create'}
            </Btn>
          </div>

          {isEditing && (
            <div className={styles.dangerZone}>
              <div className={styles.dangerHeader}>Danger Zone</div>
              {!showDeleteConfirm ? (
                <button
                  className={styles.deleteBtn}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete this collection
                </button>
              ) : (
                <div className={styles.deleteConfirm}>
                  <p className={styles.deleteWarning}>
                    This will delete the collection. Tags in this collection will remain unchanged.
                    This action cannot be undone.
                  </p>
                  <div className={styles.deleteActions}>
                    <Btn
                      small
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Btn>
                    <button
                      className={styles.dangerBtn}
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Collection'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
