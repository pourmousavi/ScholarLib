import { useState } from 'react'
import Modal from '../ui/Modal'
import styles from './DangerousActionModal.module.css'

/**
 * DangerousActionModal - Confirmation modal for dangerous/destructive actions
 *
 * Features:
 * - Red-themed danger styling
 * - Impact preview with counts
 * - Type-to-confirm pattern
 * - Loading state during deletion
 */
export default function DangerousActionModal({
  title,
  description,
  impacts,
  warnings,
  confirmText,
  onConfirm,
  onClose,
  isLoading = false,
}) {
  const [typedConfirmation, setTypedConfirmation] = useState('')
  const [error, setError] = useState(null)

  const isConfirmEnabled = typedConfirmation === confirmText && !isLoading

  const handleConfirm = async () => {
    if (!isConfirmEnabled) return

    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err.message || 'An error occurred')
    }
  }

  return (
    <Modal onClose={onClose} width={500}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.warningIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={isLoading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <p className={styles.description}>{description}</p>

          {/* Impact preview */}
          {impacts && impacts.length > 0 && (
            <div className={styles.impactSection}>
              <h4 className={styles.impactTitle}>This will delete:</h4>
              <ul className={styles.impactList}>
                {impacts.map((impact, index) => (
                  <li key={index} className={styles.impactItem}>
                    <span className={styles.impactCount}>{impact.count}</span>
                    <span className={styles.impactLabel}>{impact.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {warnings && warnings.length > 0 && (
            <div className={styles.warningsSection}>
              {warnings.map((warning, index) => (
                <div key={index} className={styles.warning}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.warningIconSmall}>
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Confirmation input */}
          <div className={styles.confirmSection}>
            <label className={styles.confirmLabel}>
              Type <code className={styles.confirmCode}>{confirmText}</code> to confirm:
            </label>
            <input
              type="text"
              className={styles.confirmInput}
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              placeholder={confirmText}
              disabled={isLoading}
              autoFocus
            />
          </div>

          {/* Error message */}
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner} />
                Deleting...
              </>
            ) : (
              'Delete Permanently'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
