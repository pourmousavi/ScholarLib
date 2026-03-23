import { useState } from 'react'
import Modal from '../ui/Modal'
import styles from './HelpModal.module.css'

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started', icon: 'rocket' },
  { id: 'storage', label: 'Storage Setup', icon: 'cloud' },
  { id: 'migration', label: 'Switching Providers', icon: 'migrate' },
  { id: 'ai', label: 'AI Setup', icon: 'brain' },
  { id: 'library', label: 'Managing Library', icon: 'folder' },
  { id: 'tags', label: 'Tags', icon: 'tag' },
  { id: 'collections', label: 'Collections', icon: 'collection' },
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
  ),
  migrate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17 3l4 4-4 4"/>
      <path d="M3 11V9a4 4 0 014-4h14"/>
      <path d="M7 21l-4-4 4-4"/>
      <path d="M21 13v2a4 4 0 01-4 4H3"/>
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),
  collection: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
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
        <li><strong>Flexible Organization</strong> — Folders for storage, tags for topics, collections for projects</li>
        <li><strong>AI Chat</strong> — Ask questions scoped to documents, folders, tags, or collections</li>
        <li><strong>Collaboration</strong> — Share folders, tags, or collections with others</li>
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
        ScholarLib offers multiple AI options. Choose based on your privacy needs, budget, and hardware.
      </p>

      <h3>Provider Comparison</h3>
      <table className={styles.comparisonTable}>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Quality</th>
            <th>Privacy</th>
            <th>Cost</th>
            <th>Hardware</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>WebLLM</strong></td>
            <td><span className={styles.qualityBasic}>Basic</span></td>
            <td>100% Local</td>
            <td>Free</td>
            <td>WebGPU browser</td>
          </tr>
          <tr>
            <td><strong>Ollama (1-3B)</strong></td>
            <td><span className={styles.qualityBasic}>Basic</span></td>
            <td>100% Local</td>
            <td>Free</td>
            <td>4-6 GB RAM</td>
          </tr>
          <tr>
            <td><strong>Ollama (7-8B)</strong></td>
            <td><span className={styles.qualityGood}>Good</span></td>
            <td>100% Local</td>
            <td>Free</td>
            <td>8-10 GB RAM</td>
          </tr>
          <tr>
            <td><strong>Ollama (70B)</strong></td>
            <td><span className={styles.qualityExcellent}>Excellent</span></td>
            <td>100% Local</td>
            <td>Free</td>
            <td>48-64 GB RAM</td>
          </tr>
          <tr>
            <td><strong>Claude API</strong></td>
            <td><span className={styles.qualityExcellent}>Excellent</span></td>
            <td>Cloud</td>
            <td>$0.80-15/M tokens</td>
            <td>None</td>
          </tr>
          <tr>
            <td><strong>OpenAI</strong></td>
            <td><span className={styles.qualityExcellent}>Excellent</span></td>
            <td>Cloud</td>
            <td>$0.15-10/M tokens</td>
            <td>None</td>
          </tr>
        </tbody>
      </table>

      <h3>Quality Expectations</h3>
      <div className={styles.qualityGuide}>
        <div className={styles.qualityItem}>
          <strong><span className={styles.qualityBasic}>Basic</span> (1-3B models)</strong>
          <p>Simple summaries and basic Q&A. May miss nuances or complex relationships between concepts. Good for quick lookups.</p>
        </div>
        <div className={styles.qualityItem}>
          <strong><span className={styles.qualityGood}>Good</span> (7-8B models)</strong>
          <p>Solid comprehension of academic papers. Handles most research questions well. Recommended for most users.</p>
        </div>
        <div className={styles.qualityItem}>
          <strong><span className={styles.qualityExcellent}>Excellent</span> (70B+ / APIs)</strong>
          <p>Deep understanding with nuanced analysis. Best for complex research synthesis and detailed explanations.</p>
        </div>
      </div>

      <h3>Hardware Requirements</h3>
      <table className={styles.hardwareTable}>
        <thead>
          <tr>
            <th>Model Size</th>
            <th>RAM Needed</th>
            <th>Example Hardware</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1-3B</td>
            <td>4-6 GB</td>
            <td>MacBook Air M1, any modern laptop</td>
          </tr>
          <tr>
            <td>7-8B</td>
            <td>8-10 GB</td>
            <td>MacBook Pro M1/M2, 16GB laptop</td>
          </tr>
          <tr>
            <td>70B</td>
            <td>48-64 GB</td>
            <td>Mac Studio, high-end workstation</td>
          </tr>
        </tbody>
      </table>

      <h3>Setup: WebLLM (Browser)</h3>
      <div className={styles.aiOption}>
        <div className={styles.aiHeader}>
          <strong>WebLLM</strong>
          <span className={styles.badge}>Free</span>
        </div>
        <p>Runs entirely in your browser using WebGPU. No data leaves your device.</p>
        <div className={styles.aiSetup}>
          <strong>Setup:</strong>
          <ol>
            <li>Go to Settings → AI & Models</li>
            <li>Select "WebLLM (Browser)"</li>
            <li>Choose a model (Llama 3.2 3B recommended)</li>
            <li>Click "Download Model" (~2GB, one-time)</li>
          </ol>
          <p className={styles.note}>Requires Chrome 113+, Edge 113+, or Safari 18+ with WebGPU.</p>
        </div>
        <div className={styles.privacyHighlight}>
          <strong>100% Private</strong>
          <p>All processing happens locally in your browser. No data ever leaves your device.</p>
        </div>
      </div>

      <h3>Setup: Ollama (Local)</h3>
      <div className={styles.aiOption}>
        <div className={styles.aiHeader}>
          <strong>Ollama</strong>
          <span className={styles.badge}>Free</span>
        </div>
        <p>Runs AI on your computer via a local server. Fast, private, and supports larger models.</p>
        <div className={styles.aiSetup}>
          <strong>Setup:</strong>
          <ol>
            <li>Download Ollama from <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">ollama.ai</a></li>
            <li>Start Ollama with CORS enabled (see below)</li>
            <li>In ScholarLib Settings, select "Ollama (Local)"</li>
            <li>Click "Test connection" to verify</li>
            <li>Use "Download New Model" to get models directly from Settings</li>
          </ol>
        </div>
        <div className={styles.aiSetup} style={{ marginTop: 12 }}>
          <strong>CORS Configuration (Required):</strong>
          <p className={styles.note} style={{ marginTop: 8 }}>Ollama needs CORS enabled to work with web apps.</p>
          <p style={{ marginTop: 8, marginBottom: 4 }}><strong>macOS (temporary):</strong></p>
          <code>OLLAMA_ORIGINS="*" ollama serve</code>
          <p style={{ marginTop: 8, marginBottom: 4 }}><strong>macOS (permanent):</strong></p>
          <code>launchctl setenv OLLAMA_ORIGINS "*"</code>
          <p style={{ marginTop: 8, marginBottom: 4 }}><strong>Linux:</strong></p>
          <code>OLLAMA_ORIGINS="*" ollama serve</code>
          <p style={{ marginTop: 8, marginBottom: 4 }}><strong>Windows (PowerShell):</strong></p>
          <code>$env:OLLAMA_ORIGINS="*"; ollama serve</code>
        </div>
        <div className={styles.privacyHighlight}>
          <strong>100% Private</strong>
          <p>All processing runs locally on your machine. Your documents never leave your computer.</p>
        </div>
      </div>

      <h3>Setup: Claude API</h3>
      <div className={styles.aiOption}>
        <div className={styles.aiHeader}>
          <strong>Claude API (Anthropic)</strong>
          <span className={styles.badge}>Paid</span>
        </div>
        <p>High-quality responses using Anthropic's Claude models. Best-in-class for academic work.</p>
        <div className={styles.aiSetup}>
          <strong>Setup:</strong>
          <ol>
            <li>Create account at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">console.anthropic.com</a></li>
            <li>Add billing and generate an API key</li>
            <li>Go to Settings → AI & Models → Claude API</li>
            <li>Enter your API key and click "Test key"</li>
          </ol>
        </div>
        <div className={styles.pricingNote}>
          <strong>Pricing (approximate):</strong>
          <p>Haiku: ~$0.80/M tokens (cheapest) • Sonnet: ~$3/M input • Opus: ~$15/M input</p>
          <p>Typical Q&A session uses 1-5K tokens (~$0.01-0.05 for Haiku)</p>
        </div>
      </div>

      <h3>Setup: OpenAI API</h3>
      <div className={styles.aiOption}>
        <div className={styles.aiHeader}>
          <strong>OpenAI</strong>
          <span className={styles.badge}>Paid</span>
        </div>
        <p>Access GPT-4o and other OpenAI models.</p>
        <div className={styles.aiSetup}>
          <strong>Setup:</strong>
          <ol>
            <li>Create account at <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer">platform.openai.com</a></li>
            <li>Add billing and generate an API key</li>
            <li>Go to Settings → AI & Models → OpenAI API</li>
            <li>Enter your API key and click "Test key"</li>
          </ol>
        </div>
        <div className={styles.pricingNote}>
          <strong>Pricing (approximate):</strong>
          <p>GPT-4o-mini: ~$0.15/M input • GPT-4o: ~$2.50/M input</p>
        </div>
      </div>

      <h3>Troubleshooting</h3>
      <div className={styles.troubleshooting}>
        <div className={styles.troubleItem}>
          <strong>"Cannot reach Ollama"</strong>
          <p>This usually means CORS is not configured. Make sure to start Ollama with:</p>
          <code>OLLAMA_ORIGINS="*" ollama serve</code>
          <p>If Ollama is already running, quit it completely first, then restart with the command above.</p>
        </div>

        <div className={styles.troubleItem}>
          <strong>"WebGPU not supported"</strong>
          <p>Your browser doesn't support WebGPU. Try:</p>
          <p>• Chrome 113+ or Edge 113+ (enable at chrome://flags → WebGPU)</p>
          <p>• Safari 18+ on macOS (enable in Developer menu)</p>
        </div>

        <div className={styles.troubleItem}>
          <strong>"API key invalid"</strong>
          <p>Check that you copied the full API key without extra spaces. For Claude, keys start with "sk-ant-". For OpenAI, keys start with "sk-".</p>
        </div>

        <div className={styles.troubleItem}>
          <strong>"Out of memory" / Slow responses</strong>
          <p>The model is too large for your hardware. Try a smaller model:</p>
          <p>• For 8GB RAM: Use 3B models (llama3.2)</p>
          <p>• For 16GB RAM: Use 7-8B models (llama3.1:8b)</p>
        </div>
      </div>

      <h3>AI Status Indicator</h3>
      <p>The bottom of the sidebar shows your current AI status:</p>
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

      <h3>Tagging Documents</h3>
      <ul>
        <li>Right-click a document → "Manage tags..." to assign tags</li>
        <li>Create and manage tags in the <strong>TAGS</strong> section of the sidebar</li>
        <li>See the <strong>Tags & Organization</strong> section for detailed tag usage</li>
      </ul>

      <h3>Search</h3>
      <p>
        Use the search box at the top of the sidebar to find documents by title,
        author, journal, or keywords.
      </p>
    </div>
  )

  const renderTags = () => (
    <div className={styles.content}>
      <h2>Tags</h2>
      <p className={styles.intro}>
        Tags are labels for grouping <strong>semantically similar documents</strong> together.
        Use tags when papers share a common theme, methodology, topic, or characteristic.
        Unlike folders, a document can have multiple tags, enabling cross-cutting organization.
      </p>

      <h3>What Tags Are For</h3>
      <p>
        Think of tags as a way to mark papers that belong together conceptually. A tag like
        "Deep Learning" groups all papers that use or discuss deep learning methods, regardless
        of which folder they're stored in. Similarly, a "Review Papers" tag identifies all
        literature reviews across your library.
      </p>
      <ul className={styles.featureList}>
        <li><strong>Semantic grouping</strong> — Group papers by what they're about, not where they're stored</li>
        <li><strong>Cross-folder organization</strong> — A paper can have multiple tags without duplication</li>
        <li><strong>Quick filtering</strong> — Click a tag to instantly see all documents with that tag</li>
        <li><strong>AI Chat scope</strong> — Ask AI questions about all papers with specific tags</li>
        <li><strong>Shareable</strong> — Share tags with collaborators (papers with that tag become visible to them)</li>
      </ul>

      <h3>Tags vs Collections</h3>
      <p>
        Tags and Collections work together but serve different purposes.
        See the <strong>Collections</strong> section for a detailed comparison.
      </p>
      <table className={styles.comparisonTable}>
        <thead>
          <tr>
            <th>Aspect</th>
            <th>Tags</th>
            <th>Collections</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Purpose</td>
            <td>Group similar documents</td>
            <td>Organize for a specific goal</td>
          </tr>
          <tr>
            <td>Scope</td>
            <td>Semantic/topical</td>
            <td>Project/task-oriented</td>
          </tr>
          <tr>
            <td>Contains</td>
            <td>Documents directly</td>
            <td>Tags (documents indirectly)</td>
          </tr>
          <tr>
            <td>Example</td>
            <td>"Machine Learning", "Survey"</td>
            <td>"PhD Thesis Chapter 3"</td>
          </tr>
        </tbody>
      </table>

      <h3>Creating Tags</h3>
      <p>Tags are created in the <strong>TAGS</strong> section of the left sidebar:</p>
      <ol className={styles.steps}>
        <li>Look for the <strong>TAGS</strong> section below your folders</li>
        <li>Click the <strong>+</strong> button next to "TAGS"</li>
        <li>Enter a name for your tag and press Enter</li>
        <li>The tag is created with an automatic color</li>
      </ol>

      <h3>Managing Tags</h3>
      <p>Right-click any tag in the TAGS section to access options:</p>
      <ul>
        <li><strong>Edit tag</strong> — Change the name, color, category, or add a description</li>
        <li><strong>Filter by this tag</strong> — Show all documents with this tag</li>
        <li><strong>Share tag</strong> — Make this tag and its documents visible to collaborators</li>
        <li><strong>Add to collection</strong> — Include this tag in a collection</li>
      </ul>

      <h3>Assigning Tags to Documents</h3>
      <ul>
        <li><strong>Right-click menu:</strong> Right-click a document → "Manage tags..." → Check/uncheck tags</li>
        <li><strong>Edit metadata:</strong> Right-click → "Edit metadata" → Add tags in the Tags field</li>
        <li><strong>Bulk tagging:</strong> Select multiple documents, then use bulk actions to add/remove tags</li>
      </ul>

      <h3>Filtering by Tags</h3>
      <ul>
        <li><strong>Single tag:</strong> Click a tag to see all documents with that tag</li>
        <li><strong>Multiple tags:</strong> Hold Shift and click to select multiple tags</li>
        <li><strong>AND mode:</strong> Show documents that have ALL selected tags</li>
        <li><strong>OR mode:</strong> Show documents that have ANY of the selected tags</li>
      </ul>

      <h3>Merging Tags</h3>
      <p>If you have duplicate or similar tags:</p>
      <ol className={styles.steps}>
        <li>Click the merge icon next to the TAGS header</li>
        <li>Select source tags (will be deleted)</li>
        <li>Select target tag (will be kept)</li>
        <li>Click "Merge Tags" — all documents are updated automatically</li>
      </ol>

      <h3>Keywords vs Tags</h3>
      <ul>
        <li><strong>Keywords</strong> — Automatically extracted from the paper's metadata (author-assigned)</li>
        <li><strong>Tags</strong> — Your personal organizational labels that you create and assign</li>
      </ul>
      <p>Both can be displayed on document cards. Control this in Settings → Appearance.</p>

      <h3>Tips for Effective Tagging</h3>
      <ul>
        <li>Keep tag names short and consistent</li>
        <li>Use tags for <em>what a paper is about</em>, not <em>what you're using it for</em> (use collections for that)</li>
        <li>Consider tags like "To Read", "Reviewed", or "Key Paper" for workflow</li>
        <li>Don't over-tag — 2-5 tags per document is usually sufficient</li>
      </ul>
    </div>
  )

  const renderCollections = () => (
    <div className={styles.content}>
      <h2>Collections</h2>
      <p className={styles.intro}>
        Collections are <strong>higher-level groupings of tags</strong> that organize documents
        for a specific purpose or project. While tags group semantically similar documents,
        collections bring together documents you need for a particular task — like writing
        a paper, preparing a thesis chapter, or conducting a literature review.
      </p>

      <h3>Understanding Collections vs Tags</h3>
      <p>
        The key difference is in their purpose and how they relate to documents:
      </p>

      <div className={styles.conceptBox}>
        <div className={styles.conceptItem}>
          <strong>Tags: "What is this paper about?"</strong>
          <p>
            Tags describe the content or nature of a document. A paper tagged "Deep Learning"
            and "Computer Vision" belongs with other papers on those topics. Tags are semantic —
            they capture what documents have in common conceptually.
          </p>
        </div>
        <div className={styles.conceptItem}>
          <strong>Collections: "What do I need this paper for?"</strong>
          <p>
            Collections gather documents for a specific goal. A "PhD Thesis Chapter 3" collection
            might include papers tagged "Battery Modeling", "State Estimation", and "Machine Learning" —
            not because these tags are related, but because you need all of them for that chapter.
          </p>
        </div>
      </div>

      <h3>How Collections Work</h3>
      <p>Collections contain <strong>tags</strong>, not documents directly. A document belongs to a collection if it has any of the collection's tags.</p>
      <ul>
        <li>Add tags to a collection to include all documents with those tags</li>
        <li>A single collection can contain multiple unrelated tags</li>
        <li>Documents automatically appear/disappear as tags are added/removed</li>
        <li>You can exclude specific documents from a collection even if they have matching tags</li>
      </ul>

      <h3>Example: Writing a Paper</h3>
      <p>Imagine you're writing a paper on "Energy-Aware Machine Learning for IoT Devices":</p>
      <ol className={styles.steps}>
        <li>You have tags: "Energy Efficiency", "Machine Learning", "IoT", "Edge Computing", "Surveys"</li>
        <li>Create a collection: "Energy-ML-IoT Paper"</li>
        <li>Add the relevant tags to this collection</li>
        <li>Now you can:
          <ul>
            <li>Filter your library to see all papers for this project</li>
            <li>Use AI Chat scoped to this collection to ask research questions</li>
            <li>Share the collection with co-authors</li>
          </ul>
        </li>
      </ol>

      <h3>Creating Collections</h3>
      <ol className={styles.steps}>
        <li>Look for the <strong>COLLECTIONS</strong> section in the left sidebar</li>
        <li>Click the <strong>+</strong> button next to "COLLECTIONS"</li>
        <li>Enter a name and optional description</li>
        <li>Select which tags to include in this collection</li>
        <li>Click "Create Collection"</li>
      </ol>

      <h3>Managing Collections</h3>
      <p>Right-click any collection to access options:</p>
      <ul>
        <li><strong>Edit collection</strong> — Change name, description, color, or tags</li>
        <li><strong>Filter by this collection</strong> — Show all documents in this collection</li>
        <li><strong>Share collection</strong> — Make this collection visible to collaborators</li>
        <li><strong>Merge collections</strong> — Combine multiple collections into one</li>
      </ul>

      <h3>Excluding Documents</h3>
      <p>
        Sometimes a document has a matching tag but doesn't belong in a particular collection.
        You can exclude specific documents:
      </p>
      <ul>
        <li>Right-click a document → "Exclude from collection..."</li>
        <li>Select which collections to exclude it from</li>
        <li>The document keeps its tags but won't appear in that collection</li>
        <li>You can re-include the document later if needed</li>
      </ul>

      <h3>Filtering by Collections</h3>
      <ul>
        <li><strong>Single collection:</strong> Click a collection to see all its documents</li>
        <li><strong>Multiple collections:</strong> Hold Shift and click to select multiple</li>
        <li><strong>AND mode:</strong> Show documents that appear in ALL selected collections</li>
        <li><strong>OR mode:</strong> Show documents that appear in ANY selected collection</li>
      </ul>

      <h3>Collections in AI Chat</h3>
      <p>
        Collections are especially powerful with AI Chat. Scope your questions to a collection
        to get answers based only on papers relevant to that project:
      </p>
      <ul>
        <li>Click "Collections" in the AI Chat scope selector</li>
        <li>Select one or more collections</li>
        <li>Choose AND/OR mode for multiple collections</li>
        <li>Your questions will only search documents in those collections</li>
      </ul>

      <h3>Sharing Collections</h3>
      <p>
        Share entire collections with collaborators. When you share a collection, all documents
        in that collection become visible to the shared users:
      </p>
      <ul>
        <li>Right-click a collection → "Share collection..."</li>
        <li>Enter email addresses of collaborators</li>
        <li>Choose permission level (view or edit)</li>
        <li>Collaborators see the collection and can filter by it</li>
      </ul>

      <h3>Comparison Table</h3>
      <table className={styles.comparisonTable}>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Tags</th>
            <th>Collections</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Purpose</td>
            <td>Categorize by content/topic</td>
            <td>Organize for a project/task</td>
          </tr>
          <tr>
            <td>Contains</td>
            <td>Documents (directly)</td>
            <td>Tags (documents indirectly)</td>
          </tr>
          <tr>
            <td>Exclusions</td>
            <td>No (all tagged docs included)</td>
            <td>Yes (exclude specific docs)</td>
          </tr>
          <tr>
            <td>Typical use</td>
            <td>"ML", "Survey", "2024"</td>
            <td>"Thesis Ch.3", "Grant Proposal"</td>
          </tr>
          <tr>
            <td>Question answered</td>
            <td>"What is this about?"</td>
            <td>"What do I need this for?"</td>
          </tr>
        </tbody>
      </table>

      <h3>Tips for Using Collections</h3>
      <ul>
        <li>Create a collection for each major writing project or research goal</li>
        <li>Name collections by their purpose: "Thesis Chapter 3", "Review Paper Draft", "Grant Literature"</li>
        <li>Use collections to scope AI Chat for project-specific research questions</li>
        <li>Share collections with co-authors working on the same project</li>
        <li>A collection can include tags that aren't related to each other — that's the point!</li>
      </ul>
    </div>
  )

  const renderChat = () => (
    <div className={styles.content}>
      <h2>AI Chat</h2>
      <p className={styles.intro}>
        Ask questions about your papers and get AI-powered answers with citations.
        The AI searches your documents, retrieves relevant passages, and generates
        answers based on your actual research.
      </p>

      <h3>Chat Scope</h3>
      <p>Control which documents the AI searches when answering. The scope selector appears above the chat input:</p>
      <ul>
        <li><strong>This doc:</strong> Only the currently selected document</li>
        <li><strong>Folder:</strong> All documents in the current folder</li>
        <li><strong>All:</strong> Your entire library</li>
        <li><strong>Tags:</strong> Documents with specific tags you select</li>
        <li><strong>Collections:</strong> Documents in specific collections you select</li>
      </ul>

      <h3>Using Tags & Collections Scope</h3>
      <p>Tags and Collections scope options appear when you have tags/collections in your library:</p>
      <ol className={styles.steps}>
        <li>Click <strong>Tags</strong> or <strong>Collections</strong> in the scope selector</li>
        <li>A dropdown appears — check the tags/collections you want to include</li>
        <li>If you select multiple, choose the mode:
          <ul>
            <li><strong>AND:</strong> Documents must match ALL selected tags/collections</li>
            <li><strong>OR:</strong> Documents matching ANY selected tag/collection</li>
          </ul>
        </li>
        <li>The dropdown shows how many documents match your selection</li>
      </ol>
      <p>
        This is especially powerful for project-focused research. Scope to a collection like
        "Thesis Chapter 3" to ask questions only about papers relevant to that chapter.
      </p>

      <h3>How It Works</h3>
      <ol>
        <li>Your question is used to search relevant passages in the scoped documents</li>
        <li>The most relevant chunks are retrieved (semantic search)</li>
        <li>Retrieved context is sent to the AI along with your question</li>
        <li>AI generates an answer based on your actual papers, with citations</li>
      </ol>

      <h3>Quick Prompts</h3>
      <p>Use the suggested prompts for common research questions:</p>
      <ul>
        <li>"Summarise key findings"</li>
        <li>"What methods were used?"</li>
        <li>"List main conclusions"</li>
        <li>"Identify research gaps"</li>
        <li>"Compare approaches across papers"</li>
      </ul>

      <h3>Chat History</h3>
      <ul>
        <li>Conversations are automatically saved</li>
        <li>Click the <strong>clock icon</strong> in the sidebar to view history</li>
        <li>Resume any previous conversation with its original scope</li>
        <li>Export conversations as text for your notes</li>
      </ul>

      <h3>Tips</h3>
      <ul>
        <li>Be specific in your questions for better answers</li>
        <li>Use "Folder" scope when comparing papers in the same research area</li>
        <li>Use "Collections" scope when working on a specific project</li>
        <li>Use "Tags" scope to explore a topic across your whole library</li>
        <li>Start a new conversation (+) when changing topics or scope</li>
        <li>Narrow your scope for faster, more focused answers</li>
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
        <li><strong>Show Tags:</strong> Display your assigned tags on document cards</li>
        <li><strong>Show Keywords:</strong> Display paper keywords (from metadata) on document cards</li>
        <li><strong>Font Size:</strong> Normal or Large (scales all text)</li>
        <li><strong>PDF Default Zoom:</strong> Initial zoom level when opening PDFs (75-150%)</li>
      </ul>

      <h3>Export & Privacy</h3>
      <ul>
        <li><strong>Default Format:</strong> Markdown, Text, PDF, or Word</li>
        <li><strong>Clear Chat History:</strong> Delete all saved conversations</li>
        <li><strong>Re-index All:</strong> Rebuild the search index for all documents</li>
        <li><strong>Remove Orphaned Documents:</strong> Clean up library entries whose PDF files no longer exist in storage</li>
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

  const renderMigration = () => (
    <div className={styles.content}>
      <h2>Switching Storage Providers</h2>
      <p className={styles.intro}>
        Moving from Dropbox to Box, or vice versa? This guide explains how to migrate your
        entire ScholarLib library to a new storage provider.
      </p>

      <h3>When to Migrate</h3>
      <ul>
        <li>Switching from personal Dropbox to university Box account</li>
        <li>Moving to a storage provider with more space</li>
        <li>Consolidating storage across services</li>
      </ul>

      <h3>What Gets Preserved</h3>
      <div className={styles.preservedList}>
        <div className={styles.preservedItem}>
          <span className={styles.checkmark}>✓</span>
          <div>
            <strong>Folder Structure</strong>
            <p>All your folders and their hierarchy</p>
          </div>
        </div>
        <div className={styles.preservedItem}>
          <span className={styles.checkmark}>✓</span>
          <div>
            <strong>Document Metadata</strong>
            <p>Titles, authors, DOIs, journals, years</p>
          </div>
        </div>
        <div className={styles.preservedItem}>
          <span className={styles.checkmark}>✓</span>
          <div>
            <strong>Notes & Annotations</strong>
            <p>All your notes for each document</p>
          </div>
        </div>
        <div className={styles.preservedItem}>
          <span className={styles.checkmark}>✓</span>
          <div>
            <strong>Chat History</strong>
            <p>All AI conversations with their document references</p>
          </div>
        </div>
        <div className={styles.preservedItem}>
          <span className={styles.checkmark}>✓</span>
          <div>
            <strong>Tags & Stars</strong>
            <p>Your document tags, stars, and read status</p>
          </div>
        </div>
      </div>

      <h3>What Needs Rebuilding</h3>
      <p>
        <strong>Vector search indexes</strong> — These need to be regenerated after import.
        Use "Re-index all documents" in Settings after importing.
      </p>

      <h3>Step 1: Export Your Library</h3>
      <div className={styles.migrationStep}>
        <ol>
          <li>Go to <strong>Settings → Storage</strong></li>
          <li>Scroll down to the <strong>Migration</strong> section</li>
          <li>Click <strong>Export Library Bundle</strong></li>
          <li>Review the export summary (folders, documents, notes, conversations)</li>
          <li>Click <strong>Download Bundle</strong></li>
          <li>Save the <code>.scholarlib</code> file somewhere safe</li>
        </ol>
      </div>

      <h3>Step 2: Transfer Your PDFs</h3>
      <div className={styles.migrationStep}>
        <p>PDFs are not included in the bundle to keep the file size manageable. Transfer them separately:</p>

        <div className={styles.transferOption}>
          <strong>Option A: Desktop Apps (Recommended)</strong>
          <p>
            If you have both Dropbox and Box desktop apps installed, simply drag the
            <code>ScholarLib/PDFs</code> folder from one to the other.
          </p>
        </div>

        <div className={styles.transferOption}>
          <strong>Option B: Web Interface</strong>
          <p>
            Download your PDFs folder as a ZIP from the old provider's website,
            then upload and extract it in the new provider.
          </p>
        </div>

        <div className={styles.transferOption}>
          <strong>Option C: Cloud Transfer Tools</strong>
          <p>
            Services like MultCloud, Mover.io, or similar can transfer files
            directly between cloud providers without downloading locally.
          </p>
        </div>
      </div>

      <h3>Step 3: Connect to New Provider</h3>
      <div className={styles.migrationStep}>
        <ol>
          <li>In ScholarLib, go to <strong>Settings → Storage</strong></li>
          <li>Click <strong>Disconnect</strong> to sign out of the current provider</li>
          <li>You'll be taken to the provider selection screen</li>
          <li>Connect to your new provider (Box or Dropbox)</li>
          <li>Authorize ScholarLib to access the new account</li>
        </ol>
      </div>

      <h3>Step 4: Import Your Library</h3>
      <div className={styles.migrationStep}>
        <ol>
          <li>Make sure your PDFs are in the <code>ScholarLib/PDFs/</code> folder on the new provider</li>
          <li>Go to <strong>Settings → Storage</strong></li>
          <li>Click <strong>Import Library Bundle</strong></li>
          <li>Select your <code>.scholarlib</code> file</li>
          <li>ScholarLib will scan for PDFs and match them to your documents</li>
          <li>Review the matching results:
            <ul>
              <li><strong>Green</strong> — PDF found, ready to import</li>
              <li><strong>Yellow</strong> — PDF not found (you can add it later)</li>
            </ul>
          </li>
          <li>Click <strong>Import Library</strong></li>
        </ol>
      </div>

      <h3>Step 5: Re-index Documents</h3>
      <div className={styles.migrationStep}>
        <p>After importing, rebuild the AI search index:</p>
        <ol>
          <li>Go to <strong>Settings → Export & Privacy</strong></li>
          <li>Click <strong>Re-index all documents</strong></li>
          <li>Wait for indexing to complete (shown in the sidebar)</li>
        </ol>
      </div>

      <h3>Troubleshooting</h3>
      <div className={styles.troubleshooting}>
        <div className={styles.troubleItem}>
          <strong>"No PDFs found"</strong>
          <p>
            Make sure your PDFs are in a folder called <code>PDFs</code> inside the <code>ScholarLib</code>
            folder. The structure should be: <code>ScholarLib/PDFs/your-papers.pdf</code>
          </p>
        </div>

        <div className={styles.troubleItem}>
          <strong>"Some documents missing PDFs"</strong>
          <p>
            This is okay! Documents will be imported with their metadata intact.
            You can upload the missing PDFs later and they'll automatically reconnect.
          </p>
        </div>

        <div className={styles.troubleItem}>
          <strong>"Import replaced my existing library"</strong>
          <p>
            Import always replaces existing data. If you need to merge libraries,
            export your current library first, then manually combine the folders.
          </p>
        </div>
      </div>
    </div>
  )

  const renderSection = () => {
    switch (activeSection) {
      case 'getting-started': return renderGettingStarted()
      case 'storage': return renderStorageSetup()
      case 'migration': return renderMigration()
      case 'ai': return renderAISetup()
      case 'library': return renderLibrary()
      case 'tags': return renderTags()
      case 'collections': return renderCollections()
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
