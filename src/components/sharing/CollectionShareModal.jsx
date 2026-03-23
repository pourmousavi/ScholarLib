import { useState, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { workerClient } from '../../services/sharing/WorkerClient'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import styles from './ShareModal.module.css'

const PERMISSIONS = [
  { id: 'viewer', label: 'Viewer', desc: 'Can read PDFs' },
  { id: 'annotator', label: 'Annotator', desc: 'Can add notes' },
  { id: 'contributor', label: 'Contributor', desc: 'Can upload PDFs' }
]

export default function CollectionShareModal({ collectionSlug, onClose }) {
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState('viewer')
  const [collaborators, setCollaborators] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [revoking, setRevoking] = useState(null)

  const collectionRegistry = useLibraryStore((s) => s.collectionRegistry)
  const updateCollection = useLibraryStore((s) => s.updateCollection)

  const { showToast } = useToast()

  const collection = collectionRegistry[collectionSlug]

  // Load collaborators from collection's shared_with on mount
  useEffect(() => {
    if (collection) {
      setCollaborators(collection.shared_with || [])
    }
    setIsLoading(false)
  }, [collection])

  const handleInvite = async (e) => {
    e.preventDefault()

    if (!email.trim()) {
      showToast({ message: 'Enter an email address', type: 'warning' })
      return
    }

    // Check for duplicate
    if (collaborators.some(c => c.email === email.trim())) {
      showToast({ message: 'This email already has access', type: 'warning' })
      return
    }

    setIsSending(true)
    try {
      const newCollab = {
        email: email.trim(),
        permission,
        share_id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        shared_at: new Date().toISOString()
      }

      // Update collection's shared_with
      const newSharedWith = [...collaborators, newCollab]
      const result = updateCollection(collectionSlug, { shared_with: newSharedWith })

      if (result.error) {
        throw new Error(result.error)
      }

      setCollaborators(newSharedWith)
      setEmail('')
      showToast({ message: `Shared with ${email}`, type: 'success' })
    } catch (error) {
      showToast({ message: error.message || 'Failed to share collection', type: 'error' })
    } finally {
      setIsSending(false)
    }
  }

  const handleRevoke = async (shareId, email) => {
    if (!confirm(`Revoke access for ${email}?`)) return

    setRevoking(shareId)
    try {
      const newSharedWith = collaborators.filter(c => c.share_id !== shareId)
      const result = updateCollection(collectionSlug, { shared_with: newSharedWith })

      if (result.error) {
        throw new Error(result.error)
      }

      setCollaborators(newSharedWith)
      showToast({ message: `Revoked access for ${email}`, type: 'success' })
    } catch (error) {
      showToast({ message: error.message || 'Failed to revoke access', type: 'error' })
    } finally {
      setRevoking(null)
    }
  }

  const handleSendReminder = (collab) => {
    const appUrl = window.location.origin + window.location.pathname
    const message = `Hi, I shared the "${collection.displayName}" collection with you on ScholarLib: ${appUrl}`
    navigator.clipboard.writeText(message)
    showToast({ message: 'Reminder message copied to clipboard', type: 'success' })
  }

  const formatSharedAt = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString()
  }

  const getInitials = (email) => {
    const name = email.split('@')[0]
    return name.slice(0, 2).toUpperCase()
  }

  if (!collection) {
    return (
      <Modal onClose={onClose} width={600}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h2>Share Collection</h2>
            <button className={styles.closeBtn} onClick={onClose}>x</button>
          </div>
          <div className={styles.empty}>Collection not found</div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} width={600}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h2>Share "{collection.displayName}"</h2>
          <button className={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {/* Invite form */}
        <form className={styles.inviteForm} onSubmit={handleInvite}>
          <div className={styles.inviteRow}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className={styles.emailInput}
              disabled={isSending}
            />
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              className={styles.permissionSelect}
              disabled={isSending}
            >
              {PERMISSIONS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <button
              type="submit"
              className={styles.inviteBtn}
              disabled={isSending || !email.trim()}
            >
              {isSending ? 'Sharing...' : 'Share'}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Collaborators list */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>People with access</h3>

          {isLoading ? (
            <div className={styles.loading}>Loading...</div>
          ) : collaborators.length === 0 ? (
            <div className={styles.empty}>Not shared with anyone yet</div>
          ) : (
            <div className={styles.collaboratorList}>
              {collaborators.map((collab) => (
                <div key={collab.share_id || collab.email} className={styles.collaborator}>
                  <div className={styles.avatar}>
                    {getInitials(collab.email)}
                  </div>
                  <div className={styles.collabInfo}>
                    <div className={styles.collabEmail}>{collab.email}</div>
                    <div className={styles.collabMeta}>
                      Shared {formatSharedAt(collab.shared_at)}
                    </div>
                  </div>
                  <div className={styles.collabPermission}>
                    {PERMISSIONS.find(p => p.id === collab.permission)?.label || collab.permission}
                  </div>
                  <div className={styles.collabActions}>
                    <button
                      className={styles.reminderBtn}
                      onClick={() => handleSendReminder(collab)}
                    >
                      Remind
                    </button>
                    <button
                      className={styles.revokeBtn}
                      onClick={() => handleRevoke(collab.share_id, collab.email)}
                      disabled={revoking === collab.share_id}
                    >
                      {revoking === collab.share_id ? '...' : 'Revoke'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info about collection tags */}
        <div className={styles.footer}>
          <span className={styles.hint}>
            Sharing gives access to all documents with tags: {collection.tags.join(', ') || 'none'}
          </span>
        </div>
      </div>
    </Modal>
  )
}
