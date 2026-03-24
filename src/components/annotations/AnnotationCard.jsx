import { memo, useCallback, useState } from 'react'
import { ANNOTATION_COLORS } from '../../services/annotations'
import styles from './AnnotationCard.module.css'

/**
 * AnnotationCard - Individual annotation item in sidebar
 *
 * Displays annotation preview with edit capabilities.
 *
 * @param {Object} annotation - The annotation object
 * @param {boolean} isSelected - Whether this annotation is selected
 * @param {function} onClick - Called when card is clicked
 * @param {function} onUpdateComment - Called when comment is updated
 * @param {function} onUpdateColor - Called when color is changed
 * @param {function} onDelete - Called when annotation is deleted
 */
function AnnotationCard({
  annotation,
  isSelected,
  onClick,
  onUpdateComment,
  onUpdateColor,
  onDelete
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [comment, setComment] = useState(annotation.comment || '')
  const [showColorPicker, setShowColorPicker] = useState(false)

  const { type, color, content, position, created_at } = annotation
  const highlightedText = content?.text || ''
  const page = position?.page || 1

  const formattedDate = created_at
    ? new Date(created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
    : ''

  const handleSaveComment = useCallback(() => {
    if (comment !== annotation.comment) {
      onUpdateComment?.(annotation.id, comment)
    }
    setIsEditing(false)
  }, [comment, annotation, onUpdateComment])

  const handleColorSelect = useCallback((newColor) => {
    onUpdateColor?.(annotation.id, newColor)
    setShowColorPicker(false)
  }, [annotation, onUpdateColor])

  const handleDelete = useCallback((e) => {
    e.stopPropagation()
    if (window.confirm('Delete this annotation?')) {
      onDelete?.(annotation.id)
    }
  }, [annotation, onDelete])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveComment()
    }
    if (e.key === 'Escape') {
      setComment(annotation.comment || '')
      setIsEditing(false)
    }
  }, [handleSaveComment, annotation.comment])

  // Get type icon
  const getTypeIcon = () => {
    switch (type) {
      case 'highlight':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.54 3.5l4.95 4.95-9.9 9.9H5.64v-4.95l9.9-9.9zm1.41-1.41l-1.41 1.41-4.95-4.95 1.41-1.41 4.95 4.95zm-12.03 17.41h12v2h-12v-2z"/>
          </svg>
        )
      case 'underline':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/>
          </svg>
        )
      case 'area':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
          </svg>
        )
      case 'note':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isEditing) {
          onClick?.()
        }
      }}
      style={{ '--annotation-color': color }}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.colorDot} style={{ backgroundColor: color }} />
        <span className={styles.typeIcon}>{getTypeIcon()}</span>
        <span className={styles.page}>Page {page}</span>
        <span className={styles.date}>{formattedDate}</span>

        <div className={styles.actions}>
          <button
            className={styles.actionButton}
            onClick={(e) => {
              e.stopPropagation()
              setShowColorPicker(!showColorPicker)
            }}
            aria-label="Change color"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
          </button>
          <button
            className={styles.actionButton}
            onClick={handleDelete}
            aria-label="Delete"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z"/>
            </svg>
          </button>
        </div>

        {/* Color picker dropdown */}
        {showColorPicker && (
          <div
            className={styles.colorPicker}
            onClick={(e) => e.stopPropagation()}
          >
            {Object.entries(ANNOTATION_COLORS).map(([name, c]) => (
              <button
                key={name}
                className={`${styles.colorOption} ${c === color ? styles.active : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => handleColorSelect(c)}
                aria-label={name}
              />
            ))}
          </div>
        )}
      </div>

      {/* Highlighted text */}
      {highlightedText && (
        <div className={styles.highlightedText}>
          {highlightedText.length > 120
            ? highlightedText.substring(0, 120) + '...'
            : highlightedText
          }
        </div>
      )}

      {/* Comment */}
      <div className={styles.commentSection}>
        {isEditing ? (
          <textarea
            className={styles.commentInput}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveComment}
            onClick={(e) => e.stopPropagation()}
            placeholder="Add a note..."
            rows={2}
            autoFocus
          />
        ) : (
          <div
            className={styles.comment}
            onClick={(e) => {
              e.stopPropagation()
              setIsEditing(true)
            }}
          >
            {annotation.comment || (
              <span className={styles.placeholder}>Add a note...</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(AnnotationCard)
