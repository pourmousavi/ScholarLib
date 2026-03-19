import { useState, useEffect, useRef, useCallback } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { NotesService } from '../../services/notes/NotesService'
import { NoteExporter } from '../../services/notes/NoteExporter'
import { useToast } from '../../hooks/useToast'
import styles from './NotesPanel.module.css'

const AI_PROMPTS = [
  { id: 'summarise', label: 'Summarise' },
  { id: 'equations', label: 'Key equations' },
  { id: 'related', label: 'Related papers' }
]

const EXPORT_OPTIONS = [
  { id: 'markdown', label: 'Markdown (.md)', icon: '#' },
  { id: 'text', label: 'Plain text (.txt)', icon: 'T' },
  { id: 'pdf', label: 'PDF (.pdf)', icon: 'P' },
  { id: 'docx', label: 'Word (.docx)', icon: 'W' },
  { id: 'clipboard', label: 'Copy to clipboard', icon: 'C' }
]

export default function NotesPanel() {
  const [content, setContent] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [saveStatus, setSaveStatus] = useState('saved') // saved | saving | error
  const [lastSaved, setLastSaved] = useState(null)
  const [showExport, setShowExport] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const exportRef = useRef(null)
  const lastDocId = useRef(null)
  const contentRef = useRef(content)

  const documents = useLibraryStore((s) => s.documents)
  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const adapter = useStorageStore((s) => s.adapter)
  const isConnected = useStorageStore((s) => s.isConnected)

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
      setTags([])
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
        setTags(note.tags || [])
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

  // Auto-save on content/tags change
  const handleContentChange = useCallback((newContent) => {
    setContent(newContent)

    if (!selectedDocId || !adapter || !isConnected) return

    NotesService.saveNote(adapter, selectedDocId, {
      content: newContent,
      tags
    }, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => {
        setSaveStatus('saved')
        setLastSaved(new Date())
      },
      onSaveError: () => setSaveStatus('error')
    })
  }, [selectedDocId, adapter, isConnected, tags])

  const handleTagsChange = useCallback((newTags) => {
    setTags(newTags)

    if (!selectedDocId || !adapter || !isConnected) return

    NotesService.saveNote(adapter, selectedDocId, {
      content,
      tags: newTags
    }, {
      onSaveStart: () => setSaveStatus('saving'),
      onSaveComplete: () => {
        setSaveStatus('saved')
        setLastSaved(new Date())
      },
      onSaveError: () => setSaveStatus('error')
    })
  }, [selectedDocId, adapter, isConnected, content])

  // Add tag on Enter
  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      const newTag = tagInput.trim().toLowerCase()
      if (!tags.includes(newTag)) {
        handleTagsChange([...tags, newTag])
      }
      setTagInput('')
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      handleTagsChange(tags.slice(0, -1))
    }
  }

  // Remove tag
  const removeTag = (tagToRemove) => {
    handleTagsChange(tags.filter(t => t !== tagToRemove))
  }

  // Export handlers
  const handleExport = async (format) => {
    setShowExport(false)

    const note = { content, tags }
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
        case 'docx': {
          const blob = NoteExporter.exportAsDOCX(note, docTitle)
          NoteExporter.downloadFile(blob, `${safeTitle}-notes.docx`)
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

  // AI assistance (placeholder - will be connected in Stage 09)
  const handleAIPrompt = (promptId) => {
    showToast({ message: 'AI assistance coming in Stage 09', type: 'info' })
  }

  // Retry save on error
  const handleRetry = () => {
    if (!selectedDocId || !adapter || !isConnected) return

    NotesService.saveNote(adapter, selectedDocId, {
      content,
      tags
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
                      <span className={styles.exportIcon}>{option.icon}</span>
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

        {/* Tags section */}
        <div className={styles.tagsSection}>
          <span className={styles.tagsLabel}>Tags</span>
          <div className={styles.tags}>
            {tags.map(tag => (
              <span key={tag} className={styles.tag}>
                {tag}
                <button
                  className={styles.tagRemove}
                  onClick={() => removeTag(tag)}
                >
                  x
                </button>
              </span>
            ))}
            <input
              type="text"
              className={styles.tagInput}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder={tags.length === 0 ? 'Add tags...' : ''}
            />
          </div>
        </div>
      </div>

      {/* AI assistance strip */}
      <div className={styles.aiStrip}>
        <span className={styles.aiLabel}>AI Assistance</span>
        <div className={styles.aiButtons}>
          {AI_PROMPTS.map(prompt => (
            <button
              key={prompt.id}
              className={styles.aiBtn}
              onClick={() => handleAIPrompt(prompt.id)}
            >
              {prompt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
