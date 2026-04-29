import { useEffect, useMemo, useState } from 'react'
import { GrantIngestion } from '../../../services/wiki/grants/GrantIngestion'
import { isGrantDocument } from '../../../services/wiki/grants/GrantLibraryClassifier'
import PageReader from '../PageReader'
import styles from './GrantPanel.module.css'

const OUTCOMES = ['pending', 'under_review', 'won', 'rejected', 'withdrawn', 'other']
const RELATIONS = ['application_pdf', 'outcome_notice', 'reviewer_feedback', 'budget_attachment', 'support_letter', 'appendix', 'other']

function getOutcomeNotes(body) {
  const match = String(body || '').match(/^##\s+Outcome Notes\s*\n([\s\S]*?)(?=^#{1,6}\s+|\s*$)/m)
  return match ? match[1].trim() : ''
}

function formStateForPage(page) {
  return {
    outcome: page?.frontmatter?.outcome || 'pending',
    outcome_other: page?.frontmatter?.outcome_other || '',
    reviewer_feedback: page?.frontmatter?.reviewer_feedback || '',
    outcome_notes: getOutcomeNotes(page?.body),
  }
}

export default function GrantOutcomeForm({ grantPage, grants = [], library, adapter, onSaved }) {
  const [form, setForm] = useState(() => formStateForPage(grantPage))
  const [saving, setSaving] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachDocId, setAttachDocId] = useState('')
  const [relation, setRelation] = useState('outcome_notice')
  const [error, setError] = useState(null)

  useEffect(() => {
    setForm(formStateForPage(grantPage))
    setAttachOpen(false)
    setAttachDocId('')
    setError(null)
  }, [grantPage?.id])

  const attachedIds = useMemo(() => {
    const ids = new Set()
    for (const grant of grants) {
      for (const entry of grant.frontmatter?.related_source_docs || []) {
        if (entry.scholarlib_doc_id) ids.add(entry.scholarlib_doc_id)
      }
    }
    return ids
  }, [grants])

  const attachableDocs = useMemo(() => {
    const folders = library?.folders || []
    return Object.values(library?.documents || {})
      .filter((doc) => isGrantDocument(doc, folders))
      .filter((doc) => !attachedIds.has(doc.id))
      .sort((a, b) => String(a.metadata?.title || a.filename || a.id).localeCompare(String(b.metadata?.title || b.filename || b.id)))
  }, [library, attachedIds])

  const dirty = JSON.stringify(form) !== JSON.stringify(formStateForPage(grantPage))

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const save = async () => {
    if (!adapter || !grantPage || saving || !dirty) return
    setSaving(true)
    setError(null)
    try {
      const page = await new GrantIngestion({ adapter }).updateGrantFields(grantPage.id, form)
      onSaved?.(page)
    } catch (err) {
      setError(err.message || 'Failed to save grant')
    } finally {
      setSaving(false)
    }
  }

  const attach = async () => {
    if (!adapter || !grantPage || !attachDocId || saving) return
    setSaving(true)
    setError(null)
    try {
      const doc = library.documents[attachDocId]
      const page = await new GrantIngestion({ adapter }).attachRelatedDocument(grantPage.id, attachDocId, {
        relation,
        title: doc?.metadata?.title || doc?.filename || attachDocId,
        extractBody: true,
        library,
      })
      setAttachOpen(false)
      setAttachDocId('')
      onSaved?.(page)
    } catch (err) {
      setError(err.message || 'Failed to attach document')
    } finally {
      setSaving(false)
    }
  }

  if (!grantPage) return null

  return (
    <article className={styles.form}>
      <h3>{grantPage.frontmatter?.title || grantPage.id}</h3>
      <p className={styles.meta}>
        {[grantPage.frontmatter?.funder, grantPage.frontmatter?.program, grantPage.frontmatter?.submitted].filter(Boolean).join(' · ') || 'Grant page'}
      </p>
      {error && <p className={styles.meta}>{error}</p>}
      <div className={styles.grid}>
        <label className={styles.field}>
          Outcome
          <select value={form.outcome} onChange={(event) => update('outcome', event.target.value)}>
            {OUTCOMES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {form.outcome === 'other' && (
          <label className={styles.field}>
            Outcome text
            <input value={form.outcome_other} onChange={(event) => update('outcome_other', event.target.value)} />
          </label>
        )}
        <label className={`${styles.field} ${styles.fieldFull}`}>
          Reviewer feedback
          <textarea value={form.reviewer_feedback} onChange={(event) => update('reviewer_feedback', event.target.value)} />
        </label>
        <label className={`${styles.field} ${styles.fieldFull}`}>
          Outcome notes
          <textarea value={form.outcome_notes} onChange={(event) => update('outcome_notes', event.target.value)} />
        </label>
      </div>

      <section className={styles.preview}>
        <strong>Source documents</strong>
        <ul className={styles.docs}>
          {(grantPage.frontmatter?.related_source_docs || []).map((doc) => (
            <li key={`${doc.scholarlib_doc_id}-${doc.relation}`}>
              {doc.relation} - {doc.title || 'Untitled'} <span className={styles.docId}>{doc.scholarlib_doc_id} · {doc.added_at}</span>
            </li>
          ))}
          {(grantPage.frontmatter?.related_source_docs || []).length === 0 && <li>No related documents recorded.</li>}
        </ul>
        <button type="button" className={styles.bucket} onClick={() => setAttachOpen((value) => !value)}>
          + Attach related document
        </button>
        {attachOpen && (
          <div className={styles.attachBox}>
            <label className={styles.field}>
              Document
              <select value={attachDocId} onChange={(event) => setAttachDocId(event.target.value)}>
                <option value="">Choose a grant document</option>
                {attachableDocs.map((doc) => (
                  <option key={doc.id} value={doc.id}>{doc.metadata?.title || doc.filename || doc.id}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Relation
              <select value={relation} onChange={(event) => setRelation(event.target.value)}>
                {RELATIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div className={styles.actions}>
              <button type="button" className={styles.bucket} onClick={() => setAttachOpen(false)}>Cancel attach</button>
              <button type="button" className={styles.bucket} onClick={attach} disabled={!attachDocId || saving}>Attach</button>
            </div>
          </div>
        )}
      </section>

      <details className={styles.preview}>
        <summary>Page preview</summary>
        <PageReader body={grantPage.body} pagesById={{}} />
      </details>

      <div className={styles.actions}>
        <button type="button" className={styles.bucket} onClick={() => setForm(formStateForPage(grantPage))} disabled={!dirty || saving}>
          Cancel
        </button>
        <button type="button" className={styles.bucket} onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </article>
  )
}
