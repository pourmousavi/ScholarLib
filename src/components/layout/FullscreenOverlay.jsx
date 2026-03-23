import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/uiStore'
import { NotesPanel } from '../notes'
import { ChatPanel } from '../ai'
import styles from './FullscreenOverlay.module.css'

export default function FullscreenOverlay() {
  const fullscreenOverlayVisible = useUIStore((s) => s.fullscreenOverlayVisible)
  const toggleFullscreenOverlay = useUIStore((s) => s.toggleFullscreenOverlay)
  const fullscreenOverlayWidth = useUIStore((s) => s.fullscreenOverlayWidth)
  const setFullscreenOverlayWidth = useUIStore((s) => s.setFullscreenOverlayWidth)
  const splitViewRightTab = useUIStore((s) => s.splitViewRightTab)
  const setSplitViewRightTab = useUIStore((s) => s.setSplitViewRightTab)

  const overlayRef = useRef(null)
  const [isResizing, setIsResizing] = useState(false)

  // Handle resize drag
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e) => {
      // Calculate new width from right edge
      const newWidth = window.innerWidth - e.clientX
      setFullscreenOverlayWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, setFullscreenOverlayWidth])

  // Handle escape key to close overlay
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && fullscreenOverlayVisible) {
        toggleFullscreenOverlay()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [fullscreenOverlayVisible, toggleFullscreenOverlay])

  const tabs = [
    { id: 'ai', label: 'AI Chat' },
    { id: 'notes', label: 'Notes' }
  ]

  return (
    <>
      {/* Toggle Button - Always visible when in fullscreen */}
      <button
        className={`${styles.toggleButton} ${fullscreenOverlayVisible ? styles.open : ''}`}
        onClick={toggleFullscreenOverlay}
        title={fullscreenOverlayVisible ? 'Hide panel' : 'Show Notes/AI Chat'}
        style={fullscreenOverlayVisible ? { right: fullscreenOverlayWidth } : undefined}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {fullscreenOverlayVisible ? (
            <polyline points="9 18 15 12 9 6" />
          ) : (
            <polyline points="15 18 9 12 15 6" />
          )}
        </svg>
      </button>

      {/* Overlay Panel */}
      <div
        ref={overlayRef}
        className={`${styles.overlay} ${fullscreenOverlayVisible ? styles.visible : ''} ${isResizing ? styles.resizing : ''}`}
        style={{ width: fullscreenOverlayWidth }}
      >
        {/* Resize Handle */}
        <div
          className={styles.resizeHandle}
          onMouseDown={handleMouseDown}
        />

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.tabBar}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`${styles.tab} ${splitViewRightTab === tab.id ? styles.active : ''}`}
                onClick={() => setSplitViewRightTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            className={styles.closeBtn}
            onClick={toggleFullscreenOverlay}
            title="Close panel"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {splitViewRightTab === 'ai' && <ChatPanel />}
          {splitViewRightTab === 'notes' && <NotesPanel />}
        </div>
      </div>
    </>
  )
}
