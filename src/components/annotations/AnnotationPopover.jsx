import { memo, useCallback, useRef, useEffect, useState } from 'react'
import { ANNOTATION_COLORS } from '../../services/annotations'
import styles from './AnnotationPopover.module.css'

/**
 * AnnotationPopover - Popover for viewing/editing an annotation
 *
 * Shows annotation details and allows editing comment, color, or deleting.
 *
 * @param {Object} annotation - The annotation object
 * @param {function} onUpdateComment - Called when comment is updated
 * @param {function} onUpdateColor - Called when color is changed
 * @param {function} onDelete - Called when delete is clicked
 * @param {function} onClose - Called to dismiss popover
 * @param {Object} position - Position { top, left } for popover
 */
function AnnotationPopover({
  annotation,
  onUpdateComment,
  onUpdateColor,
  onDelete,
  onClose,
  position
}) {
  const popoverRef = useRef(null)
  const textareaRef = useRef(null)
  const [comment, setComment] = useState(annotation?.comment || '')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(comment.length, comment.length)
    }
  }, [isEditing, comment.length])

  // Reset comment when annotation changes
  useEffect(() => {
    setComment(annotation?.comment || '')
    setIsEditing(false)
  }, [annotation?.id, annotation?.comment])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        handleSave()
        onClose?.()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [comment, annotation?.comment, onClose])

  // Close on escape, save on enter (without shift)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setComment(annotation?.comment || '')
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [annotation?.comment, onClose])

  const handleSave = useCallback(() => {
    if (comment !== annotation?.comment) {
      onUpdateComment?.(annotation.id, comment)
    }
    setIsEditing(false)
  }, [comment, annotation, onUpdateComment])

  const handleColorSelect = useCallback((color) => {
    onUpdateColor?.(annotation.id, color)
    setShowColorPicker(false)
  }, [annotation, onUpdateColor])

  const handleDelete = useCallback(() => {
    if (window.confirm('Delete this annotation?')) {
      onDelete?.(annotation.id)
      onClose?.()
    }
  }, [annotation, onDelete, onClose])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }, [handleSave])

  if (!annotation) {
    return null
  }

  const { type, color, content, created_at } = annotation
  const highlightedText = content?.text || ''
  const formattedDate = created_at
    ? new Date(created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : ''

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{
        top: `${position?.top || 0}px`,
        left: `${position?.left || 0}px`
      }}
      role="dialog"
      aria-label="Annotation details"
    >
      {/* Header with color and actions */}
      <div className={styles.header}>
        <div className={styles.colorSection}>
          <button
            className={styles.colorButton}
            onClick={() => setShowColorPicker(!showColorPicker)}
            style={{ backgroundColor: color }}
            aria-label="Change color"
            aria-expanded={showColorPicker}
          />

          {showColorPicker && (
            <div className={styles.colorPicker}>
              {Object.entries(ANNOTATION_COLORS).map(([name, c]) => (
                <button
                  key={name}
                  className={`${styles.colorOption} ${c === color ? styles.selected : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => handleColorSelect(c)}
                  aria-label={`${name} color`}
                />
              ))}
            </div>
          )}
        </div>

        <span className={styles.type}>{type}</span>
        <span className={styles.date}>{formattedDate}</span>

        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={handleDelete}
            aria-label="Delete annotation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z"/>
            </svg>
          </button>
          <button
            className={styles.actionButton}
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Highlighted text preview */}
      {highlightedText && (
        <div className={styles.highlightedText} style={{ borderLeftColor: color }}>
          {highlightedText.length > 200
            ? highlightedText.substring(0, 200) + '...'
            : highlightedText
          }
        </div>
      )}

      {/* Comment section */}
      <div className={styles.commentSection}>
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className={styles.commentInput}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="Add a note..."
            rows={3}
          />
        ) : (
          <div
            className={styles.commentDisplay}
            onClick={() => setIsEditing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setIsEditing(true)
              }
            }}
          >
            {comment || <span className={styles.placeholder}>Add a note...</span>}
          </div>
        )}
      </div>

      {/* Footer with save indicator */}
      {isEditing && (
        <div className={styles.footer}>
          <span className={styles.hint}>Press Enter to save, Shift+Enter for new line</span>
        </div>
      )}
    </div>
  )
}

export default memo(AnnotationPopover)
