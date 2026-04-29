import { useMemo, useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { isGrantDocument } from '../../services/wiki/grants/GrantLibraryClassifier'
import styles from './MetadataPreflightModal.module.css'

function authorsToText(authors) {
  if (!Array.isArray(authors)) return authors || ''
  return authors.map((author) => {
    if (typeof author === 'string') return author
    return [author.first, author.last].filter(Boolean).join(' ')
  }).filter(Boolean).join(', ')
}

function textToAuthors(text) {
  return String(text || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function hasTitleDefect(title) {
  const text = String(title || '')
  return /\d+[A-Za-z]/.test(text) && /[A-Za-z]\d{4,}/.test(text)
}

export default function MetadataPreflightModal({ document, library, adapter, defaultType, onIngest, onCancel }) {
  const updateDocument = useLibraryStore((s) => s.updateDocument)
  const metadata = document?.metadata || {}
  const inferredType = defaultType || (isGrantDocument(document, library?.folders || []) ? 'grant' : 'paper')
  const [type, setType] = useState(inferredType)
  const [title, setTitle] = useState(metadata.title || document?.filename || '')
  const [doi, setDoi] = useState(metadata.doi || '')
  const [year, setYear] = useState(metadata.year || '')
  const [authors, setAuthors] = useState(authorsToText(metadata.authors))
  const [funder, setFunder] = useState(metadata.funder || metadata.sponsor || '')
  const [program, setProgram] = useState(metadata.program || metadata.scheme || '')
  const [submitted, setSubmitted] = useState(metadata.submitted || metadata.year || '')
  const [saving, setSaving] = useState(false)
  const warning = useMemo(() => hasTitleDefect(title), [title])

  const ingest = async () => {
    if (!document || saving) return
    setSaving(true)
    const nextMetadata = type === 'grant'
      ? { ...metadata, title, funder, program, submitted }
      : { ...metadata, title, doi, year, authors: textToAuthors(authors) }
    const updatedDocument = {
      ...document,
      reference_type: type === 'grant' ? 'grant' : document.reference_type,
      metadata: nextMetadata,
      user_data: type === 'grant'
        ? { ...document.user_data, wiki_type: 'grant' }
        : document.user_data,
    }
    try {
      updateDocument(document.id, {
        reference_type: updatedDocument.reference_type,
        metadata: nextMetadata,
        user_data: updatedDocument.user_data,
      })
      if (adapter) await useLibraryStore.getState().saveLibrary(adapter)
      await onIngest?.(updatedDocument, type)
    } finally {
      setSaving(false)
    }
  }

  if (!document) return null

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="metadata preflight">
      <div className={styles.modal}>
        <h2>Check wiki metadata</h2>
        <p className={styles.meta}>{document.filename || document.id}</p>
        <label className={styles.field}>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        {warning && <p className={styles.warning}>This title may contain a joined round/year value. Check spacing before ingesting.</p>}
        <div className={styles.typeRow}>
          <label>
            <input type="radio" checked={type === 'paper'} onChange={() => setType('paper')} /> Paper
          </label>
          <label>
            <input type="radio" checked={type === 'grant'} onChange={() => setType('grant')} /> Grant
          </label>
        </div>
        {type === 'paper' ? (
          <>
            <label className={styles.field}>
              DOI
              <input value={doi} onChange={(event) => setDoi(event.target.value)} />
            </label>
            <label className={styles.field}>
              Year
              <input value={year} onChange={(event) => setYear(event.target.value)} />
            </label>
            <label className={styles.field}>
              Authors
              <input value={authors} onChange={(event) => setAuthors(event.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className={styles.field}>
              Funder
              <input value={funder} onChange={(event) => setFunder(event.target.value)} />
            </label>
            <label className={styles.field}>
              Program
              <input value={program} onChange={(event) => setProgram(event.target.value)} />
            </label>
            <label className={styles.field}>
              Submitted
              <input value={submitted} onChange={(event) => setSubmitted(event.target.value)} />
            </label>
          </>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className={styles.primary} onClick={ingest} disabled={saving || !title.trim()}>
            {saving ? 'Ingesting...' : 'Ingest with these values'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { hasTitleDefect }
