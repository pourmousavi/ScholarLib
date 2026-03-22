import { useState } from 'react'
import Modal from '../ui/Modal'
import styles from './HelpModal.module.css'

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started', icon: 'rocket' },
  { id: 'storage', label: 'Storage Setup', icon: 'cloud' },
  { id: 'ai', label: 'AI Setup', icon: 'brain' },
  { id: 'library', label: 'Managing Library', icon: 'folder' },
  { id: 'chat', label: 'AI Chat', icon: 'chat' },
  { id: 'settings', label: 'Settings Guide', icon: 'settings' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'keyboard' }
]

const SectionIcons = {
  rocket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/>
      <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
    </svg>
  ),
  brain: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1.27c.34-.6.99-1 1.73-1a2 2 0 110 4c-.74 0-1.39-.4-1.73-1H21a7 7 0 01-7 7v1.27c.6.34 1 .99 1 1.73a2 2 0 11-4 0c0-.74.4-1.39 1-1.73V23a7 7 0 01-7-7H3.73c-.34.6-.99 1-1.73 1a2 2 0 110-4c.74 0 1.39.4 1.73 1H5a7 7 0 017-7V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"/>
      <circle cx="12" cy="14" r="3"/>
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  keyboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8"/>
    </svg>
  )
}

export default function HelpModal({ onClose }) {
  const [activeSection, setActiveSection] = useState('getting-started')

  const renderGettingStarted = () => (
    <div className={styles.content}>
      <h2>Welcome to ScholarLib</h2>
      <p className={styles.intro}>
        ScholarLib is a professional academic reference manager that keeps your PDFs private
        in your own cloud storage while providing powerful AI-assisted research capabilities.
      </p>

      <h3>Quick Start Checklist</h3>
      <div className={styles.checklist}>
        <div className={styles.checkItem}>
          <span className={styles.checkNumber}>1</span>
          <div>
            <strong>Connect Storage</strong>
            <p>Link your Dropbox or Box account to store PDFs securely in your own cloud.</p>
          </div>
        </div>
        <div className={styles.checkItem}>
          <span className={styles.checkNumber}>2</span>
          <div>
            <strong>Set Up AI</strong>
            <p>Choose an AI provider: WebLLM (free, in-browser), Ollama (local), or cloud APIs.</p>
          </div>
        </div>
        <div className={styles.checkItem}>
          <span className={styles.checkNumber}>3</span>
          <div>
            <strong>Create Folders</strong>
            <p>Organize your library with folders. Right-click the sidebar to create new folders.</p>
          </div>
        </div>
        <div className={styles.checkItem}>
          <span className={styles.checkNumber}>4</span>
          <div>
            <strong>Upload PDFs</strong>
            <p>Drag & drop PDFs into a folder. Metadata is automatically extracted.</p>
          </div>
        </div>
        <div className={styles.checkItem}>
          <span className={styles.checkNumber}>5</span>
          <div>
            <strong>Start Chatting</strong>
            <p>Select a document and use AI Chat to ask questions about your papers.</p>
          </div>
        </div>
      </div>

      <h3>Key Features</h3>
      <ul className={styles.featureList}>
        <li><strong>Private Storage</strong> — Your PDFs stay in your Dropbox/Box, never on our servers</li>
        <li><strong>Smart Metadata</strong> — Automatic extraction via GROBID, CrossRef, and AI</li>
        <li><strong>AI Chat</strong> — Ask questions about individual papers, folders, or your entire library</li>
        <li><strong>Notes</strong> — Take notes on papers with export to Markdown, PDF, or Word</li>
        <li><strong>PWA Support</strong> — Install as an app on Mac, Windows, or iPad</li>
      </ul>
    </div>
  )

  const renderStorageSetup = () => (
    <div className={styles.content}>
      <h2>Storage Setup</h2>
      <p className={styles.intro}>
        ScholarLib stores all your PDFs and data in your personal cloud storage account.
        This ensures your research stays private and under your control.
      </p>

      <h3>Supported Providers</h3>
      <div className={styles.providers}>
        <div className={styles.provider}>
          <strong>Dropbox</strong>
          <p>Works with free and paid accounts. Recommended for most users.</p>
        </div>
        <div className={styles.provider}>
          <strong>Box</strong>
          <p>Ideal for university accounts with unlimited storage.</p>
        </div>
      </div>

      <h3>How to Connect</h3>
      <ol className={styles.steps}>
        <li>On first launch, click "Connect Dropbox" or "Connect Box"</li>
        <li>Sign in to your cloud account when prompted</li>
        <li>Authorize ScholarLib to access a dedicated folder</li>
        <li>Your library data will be stored in <code>/Apps/ScholarLib/</code></li>
      </ol>

      <h3>Data Structure</h3>
      <p>ScholarLib creates the following structure in your cloud storage:</p>
      <pre className={styles.code}>{`/Apps/ScholarLib/
├── library.json        # Your library metadata
├── _system/
│   ├── settings.json   # App settings
│   ├── index.json      # Search index
│   └── chat_history.json
└── [Your Folders]/
    └── [Your PDFs]`}</pre>

      <h3>Switching Storage</h3>
      <p>
        To switch providers, go to <strong>Settings → Storage → Disconnect</strong>,
        then reconnect with a different account.
      </p>
    </div>
  )

  const renderAISetup = () => (
    <div className={styles.content}>
      <h2>AI Setup</h2>
      <p className={styles.intro}>
        ScholarLib offers multiple AI options. Choose based on your privacy needs and budget.
      </p>

      <h3>AI Providers</h3>

      <div className={styles.aiOption}>
        <div className={styles.aiHeader}>
          <strong>WebLLM (Recommended for Privacy)</strong>
          <span className={styles.badge}>Free</span>
        </div>
        <p>Runs AI entirely in your browser using WebGPU. No data leaves your device.</p>
        <div className={styles.aiSetup}>
          <strong>Setup:</strong>
          <ol>
            <li>Go to Settings → AI & Models</li>
            <li>Select "WebLLM (Browser)"</li>
            <li>Click "Download Model" (~2GB, one-time)</li>
            <li>Wait for download to complete</li>
          </ol>
          <p className={styles.note}>Requires Chrome 113+, Edge 113+, or Safari 18+ with WebGPU support.</p>
        </div>
      </div>

      <div className={styles.aiOption}>
        <div className={styles.aiHeader}>
          <strong>Ollama (Local Server)</strong>
          <span className={styles.badge}>Free</span>
        </div>
        <p>Runs AI on your computer via a local server. Fast and private.</p>
        <div className={styles.aiSetup}>
          <strong>Setup:</strong>
          <ol>
            <li>Download Ollama from <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a></li>
            <li>Open Terminal and run: <code>ollama serve</code></li>
            <li>Download a model: <code>ollama pull llama3.2</code></li>
            <li>In ScholarLib, select "Ollama (Local)" in Settings</li>
          </ol>
        </div>
      </div>

      <div className={styles.aiOption}>
        <div className={styles.aiHeader}>
          <strong>Claude API (Anthropic)</strong>
          <span className={styles.badge}>Paid</span>
        </div>
        <p>High-quality responses using Anthropic's Claude models.</p>
        <div className={styles.aiSetup}>
          <strong>Setup:</strong>
          <ol>
            <li>Get an API key from <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">console.anthropic.com</a></li>
            <li>Go to Settings → AI & Models</li>
            <li>Select "Claude API" and enter your key</li>
            <li>Click "Test key" to verify</li>
          </ol>
          <p className={styles.note}>Your API key is stored locally and never sent to our servers.</p>
        </div>
      </div>

      <div className={styles.aiOption}>
        <div className={styles.aiHeader}>
          <strong>OpenAI API</strong>
          <span className={styles.badge}>Paid</span>
        </div>
        <p>Access GPT-4o and other OpenAI models.</p>
        <div className={styles.aiSetup}>
          <strong>Setup:</strong>
          <ol>
            <li>Get an API key from <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer">platform.openai.com</a></li>
            <li>Go to Settings → AI & Models</li>
            <li>Select "OpenAI API" and enter your key</li>
            <li>Click "Test key" to verify</li>
          </ol>
        </div>
      </div>

      <h3>AI Status Indicator</h3>
      <p>
        The bottom of the sidebar shows your current AI status:
      </p>
      <ul>
        <li><span className={styles.dotGreen}></span> <strong>Green dot</strong> — AI is ready</li>
        <li><span className={styles.dotRed}></span> <strong>Red/gray dot</strong> — AI is offline or not configured</li>
      </ul>
    </div>
  )

  const renderLibrary = () => (
    <div className={styles.content}>
      <h2>Managing Your Library</h2>

      <h3>Creating Folders</h3>
      <ul>
        <li>Right-click in the sidebar → "New Folder"</li>
        <li>Or use the context menu on an existing folder</li>
        <li>Folders can be nested for organization</li>
      </ul>

      <h3>Adding Documents</h3>
      <ul>
        <li><strong>Drag & Drop:</strong> Drop PDF files onto a folder or the document list</li>
        <li><strong>Upload Button:</strong> Click the upload area in an empty folder</li>
        <li>Metadata is automatically extracted from PDFs</li>
      </ul>

      <h3>Metadata Extraction</h3>
      <p>ScholarLib uses multiple sources to extract paper metadata:</p>
      <ol>
        <li><strong>DOI Lookup:</strong> If a DOI is found, fetches from CrossRef</li>
        <li><strong>GROBID:</strong> ML-based extraction with 90%+ accuracy</li>
        <li><strong>AI Extraction:</strong> Fallback using your configured AI</li>
        <li><strong>OpenAlex:</strong> Enriches with citation counts and open access links</li>
      </ol>

      <h3>Editing Metadata</h3>
      <ul>
        <li>Right-click a document → "Edit Metadata"</li>
        <li>Manually correct title, authors, journal, etc.</li>
        <li>Click "Re-extract with AI" to try extraction again</li>
      </ul>

      <h3>Re-indexing Documents</h3>
      <ul>
        <li>Right-click a document → "Re-index for AI"</li>
        <li>Useful after switching to a better AI/embedding model</li>
        <li>Re-generates document chunks and embeddings for improved AI chat</li>
      </ul>

      <h3>Search</h3>
      <p>
        Use the search box at the top of the sidebar to find documents by title,
        author, journal, or keywords.
      </p>
    </div>
  )

  const renderChat = () => (
    <div className={styles.content}>
      <h2>AI Chat</h2>
      <p className={styles.intro}>
        Ask questions about your papers and get AI-powered answers with citations.
      </p>

      <h3>Chat Scope</h3>
      <p>Choose what documents the AI searches when answering:</p>
      <ul>
        <li><strong>This doc:</strong> Only the currently selected document</li>
        <li><strong>Folder:</strong> All documents in the current folder</li>
        <li><strong>All:</strong> Your entire library</li>
      </ul>

      <h3>How It Works</h3>
      <ol>
        <li>Your question is used to search relevant passages in your documents</li>
        <li>Retrieved context is sent to the AI along with your question</li>
        <li>AI generates an answer based on your actual papers</li>
      </ol>

      <h3>Quick Prompts</h3>
      <p>Use the suggested prompts for common research questions:</p>
      <ul>
        <li>"Summarise key findings"</li>
        <li>"What methods were used?"</li>
        <li>"List main conclusions"</li>
        <li>"Identify research gaps"</li>
      </ul>

      <h3>Chat History</h3>
      <ul>
        <li>Conversations are automatically saved</li>
        <li>Click the <strong>clock icon</strong> in the sidebar to view history</li>
        <li>Resume any previous conversation</li>
      </ul>

      <h3>Tips</h3>
      <ul>
        <li>Be specific in your questions for better answers</li>
        <li>Use "Folder" scope when comparing multiple papers</li>
        <li>Start a new conversation (+) when changing topics</li>
      </ul>
    </div>
  )

  const renderSettings = () => (
    <div className={styles.content}>
      <h2>Settings Guide</h2>
      <p className={styles.intro}>
        Access Settings via the gear icon at the bottom of the sidebar.
      </p>

      <h3>AI & Models</h3>
      <ul>
        <li><strong>Provider:</strong> Choose WebLLM, Ollama, Claude, OpenAI, or None</li>
        <li><strong>Model:</strong> Select specific model (varies by provider)</li>
        <li><strong>API Keys:</strong> Enter keys for cloud providers (stored locally only)</li>
      </ul>

      <h3>Storage</h3>
      <ul>
        <li><strong>Provider:</strong> Shows current Dropbox or Box connection</li>
        <li><strong>Disconnect:</strong> Sign out (data remains in cloud)</li>
      </ul>

      <h3>Metadata</h3>
      <ul>
        <li><strong>Extraction Mode:</strong>
          <ul>
            <li><em>Auto:</em> Extract and save automatically</li>
            <li><em>Review:</em> Show for review before saving</li>
            <li><em>Manual:</em> Don't auto-extract</li>
          </ul>
        </li>
        <li><strong>Sources:</strong> Toggle GROBID, OpenAlex, CrossRef, Semantic Scholar, AI</li>
        <li><strong>GROBID Endpoint:</strong> HuggingFace (recommended) or ScienceMiner</li>
      </ul>

      <h3>Appearance</h3>
      <ul>
        <li><strong>Theme:</strong> Dark or Light mode</li>
        <li><strong>Show Document Counts:</strong> Toggle folder document counts in sidebar</li>
        <li><strong>Font Size:</strong> Normal or Large (scales all text)</li>
        <li><strong>PDF Default Zoom:</strong> Initial zoom level when opening PDFs (75-150%)</li>
      </ul>

      <h3>Export & Privacy</h3>
      <ul>
        <li><strong>Default Format:</strong> Markdown, Text, PDF, or Word</li>
        <li><strong>Clear Chat History:</strong> Delete all saved conversations</li>
        <li><strong>Re-index:</strong> Rebuild the search index</li>
      </ul>
    </div>
  )

  const renderShortcuts = () => (
    <div className={styles.content}>
      <h2>Keyboard Shortcuts</h2>

      <h3>Navigation</h3>
      <table className={styles.shortcuts}>
        <tbody>
          <tr><td><kbd>↑</kbd> <kbd>↓</kbd></td><td>Navigate document list</td></tr>
          <tr><td><kbd>Enter</kbd></td><td>Open selected document</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Close modal / Clear search</td></tr>
        </tbody>
      </table>

      <h3>AI Chat</h3>
      <table className={styles.shortcuts}>
        <tbody>
          <tr><td><kbd>Enter</kbd></td><td>Send message</td></tr>
          <tr><td><kbd>Shift</kbd> + <kbd>Enter</kbd></td><td>New line in message</td></tr>
        </tbody>
      </table>

      <h3>General</h3>
      <table className={styles.shortcuts}>
        <tbody>
          <tr><td><kbd>Cmd/Ctrl</kbd> + <kbd>K</kbd></td><td>Focus search</td></tr>
          <tr><td><kbd>Cmd/Ctrl</kbd> + <kbd>,</kbd></td><td>Open settings</td></tr>
        </tbody>
      </table>
    </div>
  )

  const renderSection = () => {
    switch (activeSection) {
      case 'getting-started': return renderGettingStarted()
      case 'storage': return renderStorageSetup()
      case 'ai': return renderAISetup()
      case 'library': return renderLibrary()
      case 'chat': return renderChat()
      case 'settings': return renderSettings()
      case 'shortcuts': return renderShortcuts()
      default: return renderGettingStarted()
    }
  }

  return (
    <Modal onClose={onClose} width={900}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Help & Documentation</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.body}>
          {/* Nav */}
          <nav className={styles.nav}>
            {SECTIONS.map(section => (
              <button
                key={section.id}
                className={`${styles.navItem} ${activeSection === section.id ? styles.active : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className={styles.navIcon}>{SectionIcons[section.icon]}</span>
                <span className={styles.navLabel}>{section.label}</span>
              </button>
            ))}
          </nav>

          {/* Section content */}
          <div className={styles.sectionContent}>
            {renderSection()}
          </div>
        </div>
      </div>
    </Modal>
  )
}
