import { useState } from 'react'
import { Modal, Btn, Input, Tag, TagInput, ConfBar, Spinner } from '../ui'
import { MetadataExtractor } from '../../services/metadata/MetadataExtractor'
import styles from './MetadataModal.module.css'

export default function MetadataModal({
  metadata: initialMetadata,
  filename,
  onSave,
  onCancel,
  isExtracting = false
}) {
  const [metadata, setMetadata] = useState(initialMetadata)
  const [userTags, setUserTags] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [keywordInput, setKeywordInput] = useState('')

  const overallConfidence = MetadataExtractor.getOverallConfidence(metadata)
  const hasLowConfidence = Object.values(metadata.extraction_confidence || {})
    .some(v => v > 0 && v < 70)

  const handleChange = (field, value) => {
    setMetadata(prev => ({ ...prev, [field]: value }))
  }

  const handleAuthorsChange = (value) => {
    // Parse "Last F., Last2 F." format
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

  const handleAddKeyword = () => {
    if (!keywordInput.trim()) return
    const newKeywords = [...(metadata.keywords || []), keywordInput.trim()]
    setMetadata(prev => ({ ...prev, keywords: newKeywords }))
    setKeywordInput('')
  }

  const handleRemoveKeyword = (keyword) => {
    setMetadata(prev => ({
      ...prev,
      keywords: (prev.keywords || []).filter(k => k !== keyword)
    }))
  }

  const handleKeywordKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddKeyword()
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({ metadata, userTags })
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
    'semantic_scholar+openalex': 'Semantic Scholar + OpenAlex',
    ai: 'AI Extracted',
    'ai+crossref': 'AI + CrossRef',
    'ai+openalex': 'AI + OpenAlex',
    'ai+crossref+openalex': 'AI + CrossRef + OpenAlex',
    manual: 'Manual Entry'
  }

  return (
    <Modal onClose={onCancel} width={640}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Review Metadata</h2>
          <div className={styles.source}>
            Source: <span className={styles.sourceValue}>
              {sourceLabel[metadata.extraction_source] || 'Unknown'}
            </span>
          </div>
        </div>

        {isExtracting ? (
          <div className={styles.extracting}>
            <Spinner size={24} />
            <span>Extracting metadata...</span>
          </div>
        ) : (
          <>
            {/* Confidence summary */}
            <div className={`${styles.confidence} ${hasLowConfidence ? styles.warning : styles.success}`}>
              {hasLowConfidence ? (
                <>
                  <span className={styles.confIcon}>⚠</span>
                  <span>Some fields have low confidence. Please review carefully.</span>
                </>
              ) : overallConfidence > 80 ? (
                <>
                  <span className={styles.confIcon}>✓</span>
                  <span>High confidence extraction ({overallConfidence}%)</span>
                </>
              ) : (
                <>
                  <span className={styles.confIcon}>○</span>
                  <span>Review and complete the metadata below</span>
                </>
              )}
            </div>

            <div className={styles.form}>
              {/* Title */}
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label className={styles.label}>Title</label>
                  <ConfBar value={metadata.extraction_confidence?.title || 0} />
                </div>
                <Input
                  value={metadata.title || ''}
                  onChange={(e) => handleChange('title', e.target.value)}
                  placeholder="Paper title"
                />
              </div>

              {/* Authors */}
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label className={styles.label}>Authors</label>
                  <ConfBar value={metadata.extraction_confidence?.authors || 0} />
                </div>
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
                  <div className={styles.fieldHeader}>
                    <label className={styles.label}>Year</label>
                    <ConfBar value={metadata.extraction_confidence?.year || 0} />
                  </div>
                  <Input
                    type="number"
                    value={metadata.year || ''}
                    onChange={(e) => handleChange('year', parseInt(e.target.value) || null)}
                    placeholder="2024"
                  />
                </div>
                <div className={styles.field} style={{ flex: 2 }}>
                  <div className={styles.fieldHeader}>
                    <label className={styles.label}>Journal / Conference</label>
                    <ConfBar value={metadata.extraction_confidence?.journal || 0} />
                  </div>
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
                <div className={styles.fieldHeader}>
                  <label className={styles.label}>DOI</label>
                  <ConfBar value={metadata.extraction_confidence?.doi || 0} />
                </div>
                <Input
                  value={metadata.doi || ''}
                  onChange={(e) => handleChange('doi', e.target.value)}
                  placeholder="10.1234/example.2024"
                />
              </div>

              {/* Abstract */}
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label className={styles.label}>Abstract</label>
                  <ConfBar value={metadata.extraction_confidence?.abstract || 0} />
                </div>
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
                  {(metadata.keywords || []).map(keyword => (
                    <Tag key={keyword} label={keyword} onRemove={() => handleRemoveKeyword(keyword)} />
                  ))}
                  <input
                    className={styles.tagInput}
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={handleKeywordKeyDown}
                    placeholder="Add keyword..."
                  />
                </div>
                <span className={styles.hint}>Machine-extracted keywords from the paper</span>
              </div>

              {/* User Tags (for organization) */}
              <div className={styles.field}>
                <label className={styles.label}>Tags (for organization)</label>
                <TagInput
                  tags={userTags}
                  onChange={setUserTags}
                  placeholder="Add organizational tags..."
                />
                <span className={styles.hint}>Your personal tags for organizing this document</span>
              </div>
            </div>

            <div className={styles.footer}>
              <span className={styles.filename}>{filename}</span>
              <div className={styles.actions}>
                <Btn onClick={onCancel}>Cancel</Btn>
                <Btn gold onClick={handleSave} disabled={isSaving || !metadata.title}>
                  {isSaving ? <><Spinner size={14} color="#0a0d12" /> Saving...</> : 'Save to Library'}
                </Btn>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
