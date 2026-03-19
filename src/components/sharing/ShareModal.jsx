import { useState, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useUIStore } from '../../store/uiStore'
import { workerClient } from '../../services/sharing/WorkerClient'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import styles from './ShareModal.module.css'

const PERMISSIONS = [
  { id: 'viewer', label: 'Viewer', desc: 'Can read PDFs' },
  { id: 'annotator', label: 'Annotator', desc: 'Can add notes' },
  { id: 'contributor', label: 'Contributor', desc: 'Can upload PDFs' }
]

export default function ShareModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState('viewer')
  const [collaborators, setCollaborators] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [revoking, setRevoking] = useState(null)

  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const folders = useLibraryStore((s) => s.folders)
  const setShowModal = useUIStore((s) => s.setShowModal)

  const { showToast } = useToast()

  const folder = folders.find(f => f.id === selectedFolderId)
  const folderPath = folder ? `/${folder.slug}` : ''

  // Load collaborators on mount
  useEffect(() => {
    const loadCollaborators = async () => {
      if (!workerClient.isConfigured()) {
        setIsLoading(false)
        return
      }

      try {
        const result = await workerClient.getAccess(folderPath)
        setCollaborators(result.collaborators || [])
      } catch (error) {
        console.error('Failed to load collaborators:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (folderPath) {
      loadCollaborators()
    } else {
      setIsLoading(false)
    }
  }, [folderPath])

  const handleInvite = async (e) => {
    e.preventDefault()

    if (!email.trim()) {
      showToast({ message: 'Enter an email address', type: 'warning' })
      return
    }

    if (!workerClient.isConfigured()) {
      showToast({ message: 'Sharing service not configured', type: 'error' })
      return
    }

    setIsSending(true)
    try {
      // TODO: Get actual Box token
      const boxToken = 'demo-token'
      await workerClient.createShare(folderPath, email, permission, boxToken)

      // Add to local list
      setCollaborators(prev => [...prev, {
        collaborator_email: email,
        permission,
        created_at: new Date().toISOString(),
        last_accessed: null,
        access_count: 0
      }])

      setEmail('')
      showToast({ message: `Invited ${email}`, type: 'success' })
    } catch (error) {
      showToast({ message: error.message || 'Failed to send invite', type: 'error' })
    } finally {
      setIsSending(false)
    }
  }

  const handleRevoke = async (shareId, email) => {
    if (!confirm(`Revoke access for ${email}?`)) return

    setRevoking(shareId)
    try {
      const boxToken = 'demo-token'
      await workerClient.deleteShare(shareId, boxToken)

      setCollaborators(prev => prev.filter(c => c.share_id !== shareId))
      showToast({ message: `Revoked access for ${email}`, type: 'success' })
    } catch (error) {
      showToast({ message: error.message || 'Failed to revoke access', type: 'error' })
    } finally {
      setRevoking(null)
    }
  }

  const handleSendReminder = (collab) => {
    const appUrl = window.location.origin + window.location.pathname
    const message = `Hi, I shared some papers with you on ScholarLib: ${appUrl}`
    navigator.clipboard.writeText(message)
    showToast({ message: 'Reminder message copied to clipboard', type: 'success' })
  }

  const formatLastAccessed = (dateStr) => {
    if (!dateStr) return 'Never accessed'

    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  const getInitials = (email) => {
    const name = email.split('@')[0]
    return name.slice(0, 2).toUpperCase()
  }

  if (!folder) {
    return (
      <Modal onClose={onClose} width={600}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h2>Share Folder</h2>
            <button className={styles.closeBtn} onClick={onClose}>x</button>
          </div>
          <div className={styles.empty}>Select a folder to share</div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} width={600}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h2>Share "{folder.name}"</h2>
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
              {isSending ? 'Sending...' : 'Invite'}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Collaborators list */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>People with access</h3>

          {!workerClient.isConfigured() ? (
            <div className={styles.notConfigured}>
              <p>Sharing service not configured.</p>
              <p className={styles.hint}>Set VITE_WORKER_URL in your environment to enable sharing.</p>
            </div>
          ) : isLoading ? (
            <div className={styles.loading}>Loading collaborators...</div>
          ) : collaborators.length === 0 ? (
            <div className={styles.empty}>No collaborators yet</div>
          ) : (
            <div className={styles.collaboratorList}>
              {collaborators.map((collab) => {
                const neverAccessed = !collab.last_accessed
                return (
                  <div key={collab.share_id || collab.collaborator_email} className={styles.collaborator}>
                    <div className={styles.avatar}>
                      {getInitials(collab.collaborator_email)}
                    </div>
                    <div className={styles.collabInfo}>
                      <div className={styles.collabEmail}>{collab.collaborator_email}</div>
                      <div className={`${styles.collabMeta} ${neverAccessed ? styles.warning : ''}`}>
                        {neverAccessed && <span className={styles.warningDot} />}
                        {formatLastAccessed(collab.last_accessed)}
                        {collab.access_count > 0 && ` · ${collab.access_count} documents`}
                      </div>
                    </div>
                    <div className={styles.collabPermission}>
                      {PERMISSIONS.find(p => p.id === collab.permission)?.label || collab.permission}
                    </div>
                    <div className={styles.collabActions}>
                      {neverAccessed && (
                        <button
                          className={styles.reminderBtn}
                          onClick={() => handleSendReminder(collab)}
                        >
                          Remind
                        </button>
                      )}
                      <button
                        className={styles.revokeBtn}
                        onClick={() => handleRevoke(collab.share_id, collab.collaborator_email)}
                        disabled={revoking === collab.share_id}
                      >
                        {revoking === collab.share_id ? '...' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            className={styles.activityBtn}
            onClick={() => {
              onClose()
              setShowModal('activity')
            }}
          >
            View Activity Dashboard
          </button>
        </div>
      </div>
    </Modal>
  )
}
