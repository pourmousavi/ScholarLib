import { useState } from 'react'
import Modal from '../ui/Modal'
import Btn from '../ui/Btn'
import TagInput from '../ui/TagInput'
import { useLibraryStore } from '../../store/libraryStore'
import { smartCollectionService } from '../../services/tags/SmartCollectionService'
import styles from './SmartCollectionModal.module.css'

export default function SmartCollectionModal({ collection, onClose }) {
  const documents = useLibraryStore(s => s.documents)
  const createSmartCollection = useLibraryStore(s => s.createSmartCollection)
  const updateSmartCollection = useLibraryStore(s => s.updateSmartCollection)

  const [name, setName] = useState(collection?.name || '')
  const [tags, setTags] = useState(collection?.filter?.tags || [])
  const [tagMode, setTagMode] = useState(collection?.filter?.tagMode || 'AND')
  const [starred, setStarred] = useState(collection?.filter?.starred ?? null)
  const [read, setRead] = useState(collection?.filter?.read ?? null)
  const [isSaving, setIsSaving] = useState(false)

  // Preview matching documents
  const filter = { tags, tagMode, starred, read }
  const matchingDocIds = smartCollectionService.evaluate({ filter }, documents)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (collection) {
        await updateSmartCollection(collection.id, { name, filter })
      } else {
        await createSmartCollection(name, filter)
      }
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      title={collection ? 'Edit Smart Collection' : 'Create Smart Collection'}
      onClose={onClose}
      width={500}
    >
      <div className={styles.container}>
        <h2 className={styles.title}>
          {collection ? 'Edit Smart Collection' : 'Create Smart Collection'}
        </h2>

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Chapter 3 Sources"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Tags</label>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder="Select tags to filter by..."
            />
            {tags.length > 1 && (
              <div className={styles.modeToggle}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    checked={tagMode === 'AND'}
                    onChange={() => setTagMode('AND')}
                  />
                  Match ALL tags (AND)
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    checked={tagMode === 'OR'}
                    onChange={() => setTagMode('OR')}
                  />
                  Match ANY tag (OR)
                </label>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Additional Filters</label>
            <div className={styles.checkboxGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={starred === true}
                  onChange={e => setStarred(e.target.checked ? true : null)}
                />
                Starred only
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={read === false}
                  onChange={e => setRead(e.target.checked ? false : null)}
                />
                Unread only
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={read === true}
                  onChange={e => setRead(e.target.checked ? true : null)}
                />
                Read only
              </label>
            </div>
          </div>

          <div className={styles.preview}>
            <span className={styles.previewLabel}>Preview:</span>
            <span className={styles.previewCount}>
              {matchingDocIds.length} document{matchingDocIds.length !== 1 ? 's' : ''} match
            </span>
          </div>

          <div className={styles.actions}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn
              gold
              onClick={handleSave}
              disabled={!name.trim() || tags.length === 0 || isSaving}
            >
              {isSaving ? 'Saving...' : (collection ? 'Update' : 'Create')}
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
