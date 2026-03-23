import Modal from '../ui/Modal'
import styles from './QuickHelpModal.module.css'

const DOCS_URL = '/scholarlib/docs/'

export default function QuickHelpModal({ onClose }) {
  const openDocs = () => {
    window.open(DOCS_URL, '_blank')
  }

  return (
    <Modal onClose={onClose} width={520}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Quick Help</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.body}>
          {/* Keyboard Shortcuts Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Keyboard Shortcuts</h3>

            <div className={styles.shortcutGroup}>
              <h4 className={styles.groupTitle}>Navigation</h4>
              <div className={styles.shortcutList}>
                <div className={styles.shortcutItem}>
                  <span className={styles.keys}>
                    <kbd>↑</kbd><kbd>↓</kbd>
                  </span>
                  <span className={styles.action}>Navigate documents</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.keys}>
                    <kbd>Enter</kbd>
                  </span>
                  <span className={styles.action}>Open document</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.keys}>
                    <kbd>Esc</kbd>
                  </span>
                  <span className={styles.action}>Close modal</span>
                </div>
              </div>
            </div>

            <div className={styles.shortcutGroup}>
              <h4 className={styles.groupTitle}>General</h4>
              <div className={styles.shortcutList}>
                <div className={styles.shortcutItem}>
                  <span className={styles.keys}>
                    <kbd>⌘</kbd><kbd>K</kbd>
                  </span>
                  <span className={styles.action}>Focus search</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.keys}>
                    <kbd>⌘</kbd><kbd>,</kbd>
                  </span>
                  <span className={styles.action}>Open settings</span>
                </div>
              </div>
            </div>

            <div className={styles.shortcutGroup}>
              <h4 className={styles.groupTitle}>AI Chat</h4>
              <div className={styles.shortcutList}>
                <div className={styles.shortcutItem}>
                  <span className={styles.keys}>
                    <kbd>Enter</kbd>
                  </span>
                  <span className={styles.action}>Send message</span>
                </div>
                <div className={styles.shortcutItem}>
                  <span className={styles.keys}>
                    <kbd>Shift</kbd><kbd>Enter</kbd>
                  </span>
                  <span className={styles.action}>New line</span>
                </div>
              </div>
            </div>
          </section>

          {/* Quick Links Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Quick Links</h3>
            <div className={styles.linkList}>
              <a
                href={`${DOCS_URL}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                <span className={styles.linkIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/>
                    <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/>
                  </svg>
                </span>
                <span>Getting Started Guide</span>
              </a>
              <a
                href={`${DOCS_URL}ai/setup`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                <span className={styles.linkIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1.27c.34-.6.99-1 1.73-1a2 2 0 110 4c-.74 0-1.39-.4-1.73-1H21a7 7 0 01-7 7v1.27c.6.34 1 .99 1 1.73a2 2 0 11-4 0c0-.74.4-1.39 1-1.73V23a7 7 0 01-7-7H3.73c-.34.6-.99 1-1.73 1a2 2 0 110-4c.74 0 1.39.4 1.73 1H5a7 7 0 017-7V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/>
                    <circle cx="12" cy="14" r="3"/>
                  </svg>
                </span>
                <span>AI Setup</span>
              </a>
              <a
                href={`${DOCS_URL}library/tags`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                <span className={styles.linkIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                    <line x1="7" y1="7" x2="7.01" y2="7"/>
                  </svg>
                </span>
                <span>Tags & Collections</span>
              </a>
              <a
                href={`${DOCS_URL}ai-chat`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                <span className={styles.linkIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                </span>
                <span>AI Chat Guide</span>
              </a>
            </div>
          </section>

          {/* Open Documentation Button */}
          <button className={styles.docsButton} onClick={openDocs}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
            </svg>
            <span>Open Full Documentation</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" className={styles.externalIcon}>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        </div>
      </div>
    </Modal>
  )
}
