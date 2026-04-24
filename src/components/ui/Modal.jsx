import { useEffect, useCallback, useRef } from 'react'
import styles from './Modal.module.css'

export default function Modal({ onClose, width = 600, title, children }) {
  const modalRef = useRef(null)
  const previousActiveElement = useRef(null)

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose()
    }

    // Trap focus within modal
    if (e.key === 'Tab' && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement?.focus()
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement?.focus()
      }
    }
  }, [onClose])

  const mouseDownOnOverlayRef = useRef(false)

  const handleOverlayMouseDown = (e) => {
    // Track whether this click-drag started on the overlay itself.
    // If the user mousedowns inside an input (to start text selection) and
    // drags out to release on the overlay, the click event fires on the
    // overlay (the common ancestor) — we must NOT treat that as a dismiss.
    mouseDownOnOverlayRef.current = e.target === e.currentTarget
  }

  const handleOverlayClick = (e) => {
    const shouldClose =
      e.target === e.currentTarget && mouseDownOnOverlayRef.current
    mouseDownOnOverlayRef.current = false
    if (shouldClose) {
      onClose()
    }
  }

  useEffect(() => {
    // Store the currently focused element
    previousActiveElement.current = document.activeElement

    // Prevent body scroll
    document.body.style.overflow = 'hidden'

    // Focus the modal
    if (modalRef.current) {
      const firstFocusable = modalRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''

      // Restore focus to the previous element
      if (previousActiveElement.current && previousActiveElement.current.focus) {
        previousActiveElement.current.focus()
      }
    }
  }, [handleKeyDown])

  return (
    <div
      className={styles.overlay}
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={modalRef}
        className={styles.modal}
        style={{ width, maxWidth: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 id="modal-title" className="sr-only">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
