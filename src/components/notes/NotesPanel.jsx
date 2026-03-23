import { useState, useEffect, useRef, useCallback } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useAIStore } from '../../store/aiStore'
import { NotesService } from '../../services/notes/NotesService'
import { NoteExporter } from '../../services/notes/NoteExporter'
import { aiService } from '../../services/ai/AIService'
import { useToast } from '../../hooks/useToast'
import styles from './NotesPanel.module.css'

const AI_PROMPTS = [
  { id: 'summarise', label: 'Summarise', prompt: 'Please provide a concise summary of the following notes, highlighting the main points and key takeaways:' },
  { id: 'equations', label: 'Key equations', prompt: 'Extract and explain the key equations, formulas, or mathematical concepts mentioned in these notes. If none are explicitly stated, identify any quantitative relationships or calculations discussed:' },
  { id: 'related', label: 'Related papers', prompt: 'Based on the topics and concepts in these notes, suggest related academic papers or research areas that might be relevant for further reading:' }
]

const EXPORT_OPTIONS = [
  { id: 'markdown', label: 'Markdown (.md)' },
  { id: 'text', label: 'Plain text (.txt)' },
  { id: 'pdf', label: 'PDF (.pdf)' },
  { id: 'clipboard', label: 'Copy to clipboard' }
]

export default function NotesPanel() {
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState('saved') // saved | saving | error
  const [lastSaved, setLastSaved] = useState(null)
  const [showExport, setShowExport] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(null) // null or prompt id

  const exportRef = useRef(null)
  const lastDocId = useRef(null)
  const contentRef = useRef(content)

  const documents = useLibraryStore((s) => s.documents)
  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const adapter = useStorageStore((s) => s.adapter)
  const isConnected = useStorageStore((s) => s.isConnected)
  const aiAvailable = useAIStore((s) => s.isAvailable)
  const aiProvider = useAIStore((s) => s.provider)

  const { showToast } = useToast()

  const doc = selectedDocId ? documents[selectedDocId] : null
  const docTitle = doc?.metadata?.title || doc?.filename || 'Untitled'

  // Keep ref updated for save callback
  useEffect(() => {
    contentRef.current = content
  }, [content])

  // Load notes when doc changes
  useEffect(() => {
    if (!selectedDocId || !adapter || !isConnected) {
      setContent('')
      setIsLoading(false)
      return
    }

    // Save previous doc's note before switching
    if (lastDocId.current && lastDocId.current !== selectedDocId) {
      NotesService.flushSave(adapter)
    }

    lastDocId.current = selectedDocId
    setIsLoading(true)

    const loadNote = async () => {
      try {
        await NotesService.loadNotes(adapter)
        const note = NotesService.getNoteForDoc(selectedDocId)
        setContent(note.content || '')
        setLastSaved(note.updated_at ? new Date(note.updated_at) : null)
        setSaveStatus('saved')
      } catch (error) {
        console.error('Failed to load notes:', error)
        showToast({ message: 'Failed to load notes', type: 'error' })
      } finally {
        setIsLoading(false)
      }
    }

    loadNote()
  }, [selectedDocId, adapter, isConnected])

  // Auto-save on content change
  const handleContentChange = useCallback((newContent) => {
    setContent(newContent)

    if (!selectedDocId || !adapter || !isConnected) return

    NotesService.saveNote(adapter, selectedDocId, {
      content: newContent
    }, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => {
        setSaveStatus('saved')
        setLastSaved(new Date())
      },
      onSaveError: () => setSaveStatus('error')
    })
  }, [selectedDocId, adapter, isConnected])

  // Export handlers
  const handleExport = async (format) => {
    setShowExport(false)

    const note = { content }
    const safeTitle = docTitle.replace(/[^a-z0-9]/gi, '-').slice(0, 50)

    try {
      switch (format) {
        case 'markdown': {
          const blob = NoteExporter.exportAsMarkdown(note, docTitle)
          NoteExporter.downloadFile(blob, `${safeTitle}-notes.md`)
          break
        }
        case 'text': {
          const blob = NoteExporter.exportAsText(note, docTitle)
          NoteExporter.downloadFile(blob, `${safeTitle}-notes.txt`)
          break
        }
        case 'pdf': {
          const blob = NoteExporter.exportAsPDF(note, docTitle)
          NoteExporter.downloadFile(blob, `${safeTitle}-notes.pdf`)
          break
        }
        case 'clipboard': {
          await NoteExporter.copyToClipboard(note, docTitle)
          showToast({ message: 'Copied to clipboard', type: 'success' })
          break
        }
      }
    } catch (error) {
      console.error('Export failed:', error)
      showToast({ message: 'Export failed', type: 'error' })
    }
  }

  // AI assistance
  const handleAIPrompt = async (promptId) => {
    // Check if notes have content
    if (!content.trim()) {
      showToast({ message: 'Write some notes first before using AI assistance', type: 'info' })
      return
    }

    // Check AI availability
    const isAvailable = await aiService.checkAvailability()
    if (!isAvailable) {
      showToast({
        message: `AI not available. Configure ${aiProvider === 'ollama' ? 'Ollama' : aiProvider} in Settings.`,
        type: 'error'
      })
      return
    }

    const promptConfig = AI_PROMPTS.find(p => p.id === promptId)
    if (!promptConfig) return

    setAiLoading(promptId)

    try {
      const messages = [
        {
          role: 'system',
          content: `You are ScholarLib AI, an academic research assistant helping with personal notes about "${docTitle}". Be concise and academically precise. Format your response with markdown.`
        },
        {
          role: 'user',
          content: `${promptConfig.prompt}\n\n---\n\n${content}`
        }
      ]

      let response = ''
      for await (const chunk of aiService.streamChat(messages)) {
        response += chunk
      }

      // Append AI response to notes
      const separator = content.endsWith('\n') ? '\n' : '\n\n'
      const newContent = `${content}${separator}---\n\n**AI: ${promptConfig.label}**\n\n${response}`
      handleContentChange(newContent)

      showToast({ message: 'AI assistance added to notes', type: 'success' })
    } catch (error) {
      console.error('AI assistance failed:', error)
      showToast({
        message: error.message || 'AI assistance failed',
        type: 'error'
      })
    } finally {
      setAiLoading(null)
    }
  }

  // Retry save on error
  const handleRetry = () => {
    if (!selectedDocId || !adapter || !isConnected) return

    NotesService.saveNote(adapter, selectedDocId, {
      content
    }, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => {
        setSaveStatus('saved')
        setLastSaved(new Date())
      },
      onSaveError: () => setSaveStatus('error')
    })
  }

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setShowExport(false)
      }
    }

    if (showExport) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExport])

  // Format relative time
  const formatRelativeTime = (date) => {
    if (!date) return ''
    const seconds = Math.floor((new Date() - date) / 1000)

    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
    return date.toLocaleDateString()
  }

  // No document selected
  if (!selectedDocId) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>N</span>
          <span>Select a document to view notes</span>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.panel}>
        <div className={styles.empty}>
          <span>Loading notes...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h2 className={styles.title}>Personal notes</h2>
          <div className={styles.actions}>
            {/* Save status */}
            <span
              className={`${styles.saveStatus} ${saveStatus === 'saving' ? styles.saving : ''} ${saveStatus === 'error' ? styles.error : ''}`}
              onClick={saveStatus === 'error' ? handleRetry : undefined}
            >
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'error' && 'Save failed — retry'}
              {saveStatus === 'saved' && lastSaved && `Saved ${formatRelativeTime(lastSaved)}`}
            </span>

            {/* Export button */}
            <div className={styles.exportWrapper} ref={exportRef}>
              <button
                className={styles.exportBtn}
                onClick={() => setShowExport(!showExport)}
              >
                Export <span style={{ fontSize: 8 }}>v</span>
              </button>
              {showExport && (
                <div className={styles.exportDropdown}>
                  {EXPORT_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      className={styles.exportOption}
                      onClick={() => handleExport(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className={styles.subtitle}>
          {docTitle.length > 60 ? docTitle.slice(0, 60) + '...' : docTitle}
        </p>
      </div>

      {/* Editor area */}
      <div className={styles.editorArea}>
        <textarea
          className={styles.editor}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Write your notes here... Markdown formatting supported."
        />
      </div>

      {/* AI assistance strip */}
      <div className={styles.aiStrip}>
        <div className={styles.aiHeader}>
          <span className={styles.aiLabel}>AI Assistance</span>
          {aiLoading && (
            <span className={`${styles.aiStatus} ${styles.generating}`}>
              Generating...
            </span>
          )}
        </div>
        <div className={styles.aiButtons}>
          {AI_PROMPTS.map(prompt => (
            <button
              key={prompt.id}
              className={`${styles.aiBtn} ${aiLoading === prompt.id ? styles.loading : ''}`}
              onClick={() => handleAIPrompt(prompt.id)}
              disabled={aiLoading !== null}
            >
              {aiLoading === prompt.id ? 'Generating...' : prompt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
