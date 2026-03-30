import { memo, useCallback, useRef, useEffect, useState } from 'react'
import { ANNOTATION_COLORS } from '../../services/annotations'
import styles from './TextNoteDialog.module.css'

/**
 * TextNoteDialog - Dialog for creating/editing a text note annotation
 *
 * Appears at the click position on the PDF when the user places a note.
 * Provides a textarea for the note text and a color picker.
 *
 * @param {Object} position - Screen position { top, left } for the dialog
 * @param {string} initialColor - Initial color for the note
 * @param {string} initialText - Initial text (for editing existing notes)
 * @param {function} onSave - Called with { text, color } when saved
 * @param {function} onCancel - Called when cancelled
 */
function TextNoteDialog({ position, initialColor, initialText = '', onSave, onCancel }) {
  const dialogRef = useRef(null)
  const textareaRef = useRef(null)
  const [text, setText] = useState(initialText)
  const [color, setColor] = useState(initialColor)
  const [showColors, setShowColors] = useState(false)

  // Auto-focus the textarea on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // Reposition if dialog would overflow the viewport
  useEffect(() => {
    if (!dialogRef.current) return
    const el = dialogRef.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (rect.right > vw - 16) {
      el.style.left = `${Math.max(16, vw - rect.width - 16)}px`
    }
    if (rect.bottom > vh - 16) {
      el.style.top = `${Math.max(16, vh - rect.height - 16)}px`
    }
  }, [position])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const handleSave = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSave({ text: trimmed, color })
  }, [text, color, onSave])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }, [handleSave])

  // Prevent clicks inside dialog from propagating to PDF page
  const handleDialogClick = useCallback((e) => {
    e.stopPropagation()
  }, [])

  return (
    <div
      ref={dialogRef}
      className={styles.dialog}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`
      }}
      onClick={handleDialogClick}
      onMouseDown={handleDialogClick}
      role="dialog"
      aria-label="Add text note"
      data-annotation-popover
    >
      {/* Pin indicator */}
      <div className={styles.pin} style={{ backgroundColor: color }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      </div>

      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>Text Note</span>
        <div className={styles.headerActions}>
          {/* Color selector */}
          <div className={styles.colorSection}>
            <button
              className={styles.colorButton}
              style={{ backgroundColor: color }}
              onClick={() => setShowColors(!showColors)}
              aria-label="Change color"
            />
            {showColors && (
              <div className={styles.colorPicker}>
                {Object.entries(ANNOTATION_COLORS).map(([name, c]) => (
                  <button
                    key={name}
                    className={`${styles.colorOption} ${c === color ? styles.selected : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => { setColor(c); setShowColors(false) }}
                    aria-label={`${name} color`}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            className={styles.closeBtn}
            onClick={onCancel}
            aria-label="Cancel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className={styles.body}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your note..."
          rows={4}
        />
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.hint}>
          {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to save
        </span>
        <div className={styles.footerActions}>
          <button
            className={styles.cancelBtn}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!text.trim()}
          >
            Add Note
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(TextNoteDialog)
