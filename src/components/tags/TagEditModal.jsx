import { useState } from 'react'
import Modal from '../ui/Modal'
import Btn from '../ui/Btn'
import TagColorPicker from './TagColorPicker'
import { useLibraryStore } from '../../store/libraryStore'
import styles from './TagEditModal.module.css'

export default function TagEditModal({ slug, onClose }) {
  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const updateTag = useLibraryStore(s => s.updateTag)
  const deleteTag = useLibraryStore(s => s.deleteTag)

  const tag = tagRegistry[slug]

  const [displayName, setDisplayName] = useState(tag?.displayName || '')
  const [color, setColor] = useState(tag?.color || '#4A90D9')
  const [category, setCategory] = useState(tag?.category || '')
  const [description, setDescription] = useState(tag?.description || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Count documents with this tag
  const docCount = Object.values(documents).filter(
    d => d.user_data?.tags?.includes(slug)
  ).length

  // Get existing categories for autocomplete
  const existingCategories = [...new Set(
    Object.values(tagRegistry)
      .map(t => t.category)
      .filter(Boolean)
  )]

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateTag(slug, { displayName, color, category, description })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteTag(slug)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  if (!tag) return null

  return (
    <Modal title="Edit Tag" onClose={onClose} width={400}>
      <div className={styles.container}>
        <h2 className={styles.title}>Edit Tag</h2>

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input
              type="text"
              className={styles.input}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Tag name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Color</label>
            <TagColorPicker value={color} onChange={setColor} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Category (optional)</label>
            <input
              type="text"
              className={styles.input}
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g., topics, status, projects"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {existingCategories.map(cat => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Description (optional)</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this tag for?"
              rows={2}
            />
          </div>

          <div className={styles.meta}>
            Used in {docCount} document{docCount !== 1 ? 's' : ''}
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
              {isSaving ? 'Saving...' : 'Save'}
            </Btn>
          </div>

          <div className={styles.dangerZone}>
            <div className={styles.dangerHeader}>Danger Zone</div>
            {!showDeleteConfirm ? (
              <button
                className={styles.deleteBtn}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete this tag
              </button>
            ) : (
              <div className={styles.deleteConfirm}>
                <p className={styles.deleteWarning}>
                  This will remove the tag from {docCount} document{docCount !== 1 ? 's' : ''}.
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
                    {isDeleting ? 'Deleting...' : 'Delete Tag'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
