import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { Modal, Btn, Input, Tag, TagInput, Spinner } from '../ui'
import { MetadataExtractor } from '../../services/metadata/MetadataExtractor'
import { aiService } from '../../services/ai/AIService'
import { settingsService } from '../../services/settings/SettingsService'
import { useToast } from '../../hooks/useToast'
import styles from './MetadataModal.module.css'

export default function EditMetadataModal({ onClose }) {
  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const documents = useLibraryStore((s) => s.documents)
  const folders = useLibraryStore((s) => s.folders)
  const updateDocument = useLibraryStore((s) => s.updateDocument)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const { showToast } = useToast()

  const doc = selectedDocId ? documents[selectedDocId] : null

  const [metadata, setMetadata] = useState(doc?.metadata || {})
  const [userTags, setUserTags] = useState(doc?.user_data?.tags || [])
  const [isSaving, setIsSaving] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [tagInput, setTagInput] = useState('')

  if (!doc) {
    return null
  }

  const handleChange = (field, value) => {
    setMetadata(prev => ({ ...prev, [field]: value }))
  }

  const handleAuthorsChange = (value) => {
    const authorStrings = value.split(',').map(s => s.trim()).filter(Boolean)
    const authors = authorStrings.map(str => {
      const parts = str.trim().split(/\s+/)
      if (parts.length >= 2) {
        const first = parts.pop()
        const last = parts.join(' ')
        return { last, first, orcid: null }
      }
      return { last: str, first: '', orcid: null }
    })
    setMetadata(prev => ({ ...prev, authors }))
  }

  const authorsToString = (authors) => {
    return (authors || [])
      .map(a => `${a.last} ${a.first}`.trim())
      .join(', ')
  }

  const handleAddTag = () => {
    if (!tagInput.trim()) return
    const newTags = [...(metadata.keywords || []), tagInput.trim()]
    setMetadata(prev => ({ ...prev, keywords: newTags }))
    setTagInput('')
  }

  const handleRemoveTag = (tag) => {
    setMetadata(prev => ({
      ...prev,
      keywords: (prev.keywords || []).filter(t => t !== tag)
    }))
  }

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleReExtract = async () => {
    if (!adapter) {
      showToast({ message: 'Storage not connected', type: 'error' })
      return
    }
    if (!doc.box_path) {
      showToast({ message: 'No PDF attached — cannot re-extract metadata', type: 'error' })
      return
    }

    setIsExtracting(true)

    try {
      // Download the PDF
      const pdfBlob = await adapter.downloadFile(doc.box_path)
      const pdfBuffer = await pdfBlob.arrayBuffer()

      // pdf.js detaches the ArrayBuffer it receives, so keep a copy for GROBID
      const pdfBufferCopy = pdfBuffer.slice(0)

      // Extract text from PDF
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

      const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise
      const textParts = []
      for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items.map(item => item.str).join(' ')
        textParts.push(pageText)
      }
      const pdfText = textParts.join('\n\n')

      // Load settings
      const { remote: settings } = await settingsService.load(isDemoMode ? null : adapter)

      // Check AI availability
      const isAIAvailable = await aiService.checkAvailability()
      const aiServiceForExtraction = isAIAvailable ? aiService : null

      // Re-extract metadata
      const extractedMetadata = await MetadataExtractor.extractMetadata(
        pdfText,
        doc.filename,
        aiServiceForExtraction,
        pdfBufferCopy,
        settings
      )

      // Update local state with extracted metadata
      setMetadata(extractedMetadata)
      showToast({
        message: `Extracted via ${extractedMetadata.extraction_source || 'unknown'}`,
        type: 'success'
      })
    } catch (error) {
      console.error('Re-extraction failed:', error)
      showToast({ message: error.message || 'Extraction failed', type: 'error' })
    } finally {
      setIsExtracting(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      // Build updated document with metadata and user tags
      const updatedDoc = {
        ...doc,
        metadata,
        user_data: {
          ...doc.user_data,
          tags: userTags
        }
      }

      // Update in store
      updateDocument(doc.id, {
        metadata,
        user_data: updatedDoc.user_data
      })

      // Save to storage (store snapshot already has the updated doc)
      if (!isDemoMode && adapter) {
        await useLibraryStore.getState().saveLibrary(adapter)
      }

      showToast({ message: 'Metadata saved', type: 'success' })
      onClose()
    } catch (error) {
      console.error('Save failed:', error)
      showToast({ message: error.message || 'Failed to save', type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const sourceLabel = {
    crossref: 'CrossRef',
    'crossref+openalex': 'CrossRef + OpenAlex',
    grobid: 'GROBID (ML)',
    'grobid+crossref': 'GROBID + CrossRef',
    'grobid+openalex': 'GROBID + OpenAlex',
    'grobid+crossref+openalex': 'GROBID + CrossRef + OpenAlex',
    openalex: 'OpenAlex',
    semantic_scholar: 'Semantic Scholar',
    ai: 'AI Extracted',
    'ai+crossref': 'AI + CrossRef',
    'ai+openalex': 'AI + OpenAlex',
    manual: 'Manual Entry'
  }

  return (
    <Modal onClose={onClose} width={640}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Edit Metadata</h2>
          <div className={styles.source}>
            Source: <span className={styles.sourceValue}>
              {sourceLabel[metadata.extraction_source] || 'Unknown'}
            </span>
          </div>
        </div>

        {isExtracting ? (
          <div className={styles.extracting}>
            <Spinner size={24} />
            <span>Re-extracting metadata...</span>
          </div>
        ) : (
          <>
            <div className={styles.form}>
              {/* Title */}
              <div className={styles.field}>
                <label className={styles.label}>Title</label>
                <Input
                  value={metadata.title || ''}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="Paper title"
                />
              </div>

              {/* Authors */}
              <div className={styles.field}>
                <label className={styles.label}>Authors</label>
                <Input
                  value={authorsToString(metadata.authors)}
                  onChange={(e) => handleAuthorsChange(e.target.value)}
                  placeholder="Last F., Last2 F., Last3 F."
                />
                <span className={styles.hint}>Format: Last First, separated by commas</span>
              </div>

              {/* Year & Journal */}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Year</label>
                  <Input
                    type="number"
                    value={metadata.year || ''}
                    onChange={(e) => handleChange('year', parseInt(e.target.value) || null)}
                    placeholder="2024"
                  />
                </div>
                <div className={styles.field} style={{ flex: 2 }}>
                  <label className={styles.label}>Journal / Conference</label>
                  <Input
                    value={metadata.journal || ''}
                    onChange={(e) => handleChange('journal', e.target.value)}
                    placeholder="Journal name"
                  />
                </div>
              </div>

              {/* Volume, Issue, Pages */}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Volume</label>
                  <Input
                    value={metadata.volume || ''}
                    onChange={(e) => handleChange('volume', e.target.value)}
                    placeholder="Vol"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Issue</label>
                  <Input
                    value={metadata.issue || ''}
                    onChange={(e) => handleChange('issue', e.target.value)}
                    placeholder="No"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Pages</label>
                  <Input
                    value={metadata.pages || ''}
                    onChange={(e) => handleChange('pages', e.target.value)}
                    placeholder="1-20"
                  />
                </div>
              </div>

              {/* DOI */}
              <div className={styles.field}>
                <label className={styles.label}>DOI</label>
                <Input
                  value={metadata.doi || ''}
                  onChange={(e) => handleChange('doi', e.target.value)}
                  placeholder="10.1234/example.2024"
                />
              </div>

              {/* Abstract */}
              <div className={styles.field}>
                <label className={styles.label}>Abstract</label>
                <Input
                  multiline
                  rows={3}
                  value={metadata.abstract || ''}
                  onChange={(e) => handleChange('abstract', e.target.value)}
                  placeholder="Paper abstract..."
                />
              </div>

              {/* Keywords (from paper metadata) */}
              <div className={styles.field}>
                <label className={styles.label}>Keywords (from paper)</label>
                <div className={styles.tags}>
                  {(metadata.keywords || []).map(tag => (
                    <Tag key={tag} label={tag} onRemove={() => handleRemoveTag(tag)} />
                  ))}
                  <input
                    className={styles.tagInput}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Add keyword..."
                  />
                </div>
                <span className={styles.hint}>Machine-extracted keywords from the paper</span>
              </div>

              {/* User Tags (from global registry) */}
              <div className={styles.field}>
                <label className={styles.label}>Tags</label>
                <TagInput
                  tags={userTags}
                  onChange={setUserTags}
                  placeholder="Select or add a tag..."
                />
                <span className={styles.hint}>Your personal tags for organizing this document</span>
              </div>
            </div>

            <div className={styles.footer}>
              <Btn onClick={handleReExtract} disabled={isExtracting || !adapter || !doc.box_path} title={!doc.box_path ? 'Attach a PDF first' : ''}>
                Re-extract with AI
              </Btn>
              <div className={styles.actions}>
                <Btn onClick={onClose}>Cancel</Btn>
                <Btn gold onClick={handleSave} disabled={isSaving || !metadata.title}>
                  {isSaving ? <><Spinner size={14} color="#0a0d12" /> Saving...</> : 'Save Changes'}
                </Btn>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
