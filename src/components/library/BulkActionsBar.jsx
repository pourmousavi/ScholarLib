import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import Btn from '../ui/Btn'
import BulkTagModal from './BulkTagModal'
import styles from './BulkActionsBar.module.css'

export default function BulkActionsBar() {
  const selectedDocIds = useLibraryStore(s => s.selectedDocIds)
  const clearDocSelection = useLibraryStore(s => s.clearDocSelection)
  const [showAddTagModal, setShowAddTagModal] = useState(false)
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false)

  if (selectedDocIds.length === 0) return null

  return (
    <>
      <div className={styles.bar}>
        <span className={styles.count}>
          {selectedDocIds.length} document{selectedDocIds.length !== 1 ? 's' : ''} selected
        </span>

        <div className={styles.actions}>
          <Btn
            small
            onClick={() => setShowAddTagModal(true)}
          >
            Add Tag
          </Btn>
          <Btn
            small
            onClick={() => setShowRemoveTagModal(true)}
          >
            Remove Tag
          </Btn>
          <button
            className={styles.clearBtn}
            onClick={clearDocSelection}
          >
            Clear
          </button>
        </div>
      </div>

      {showAddTagModal && (
        <BulkTagModal
          mode="add"
          docIds={selectedDocIds}
          onClose={() => setShowAddTagModal(false)}
        />
      )}

      {showRemoveTagModal && (
        <BulkTagModal
          mode="remove"
          docIds={selectedDocIds}
          onClose={() => setShowRemoveTagModal(false)}
        />
      )}
    </>
  )
}
