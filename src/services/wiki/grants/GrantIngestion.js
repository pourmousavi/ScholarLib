import { ulid } from 'ulid'
import { PageStore, slugify } from '../PageStore'
import { GrantNamespacePolicy } from './GrantNamespacePolicy'

export class GrantIngestion {
  constructor({ adapter, pageStore = PageStore, policy = GrantNamespacePolicy } = {}) {
    if (!adapter) throw new Error('GrantIngestion requires a storage adapter')
    this.adapter = adapter
    this.pageStore = pageStore
    this.policy = policy
  }

  async ingestGrant({
    title,
    body = '',
    provider = 'ollama',
    funder = '',
    program = '',
    submitted = '',
    outcome = 'pending',
    reviewer_feedback = null,
    themes = [],
    related_papers = [],
    related_concepts = [],
    source_doc_id = '',
    source_box_path = '',
    source_filename = '',
  }) {
    this.policy.assertProviderAllowed(provider)
    const id = `g_${ulid()}`
    const frontmatter = this.policy.defaultFrontmatter({
      id,
      handle: slugify(title),
      title,
      funder,
      program,
      submitted,
      outcome,
      reviewer_feedback,
      themes,
      related_papers,
      related_concepts,
      source_doc_id,
      source_box_path,
      source_filename,
    })
    return this.pageStore.writePage(this.adapter, {
      id,
      type: 'grant',
      title,
      handle: frontmatter.handle,
      frontmatter,
      body: this.buildBody(body, reviewer_feedback),
    })
  }

  async ingestDocument(document, options = {}) {
    if (!document?.id) throw new Error('GrantIngestion.ingestDocument requires a document')
    const metadata = document.metadata || {}
    const body = await this.extractDocumentBody(document)
    return this.ingestGrant({
      title: metadata.title || document.filename || document.id,
      body,
      provider: options.provider || 'ollama',
      funder: metadata.funder || metadata.sponsor || '',
      program: metadata.program || metadata.scheme || '',
      submitted: metadata.submitted || metadata.year || '',
      outcome: metadata.outcome || 'pending',
      reviewer_feedback: metadata.reviewer_feedback || null,
      themes: metadata.keywords || document.user_data?.tags || [],
      related_papers: [],
      related_concepts: [],
      source_doc_id: document.id,
      source_box_path: document.box_path || '',
      source_filename: document.filename || '',
    })
  }

  async extractDocumentBody(document) {
    if (document.ai_chat_source_file) {
      try {
        const blob = await this.adapter.downloadFile(document.ai_chat_source_file)
        const text = await blob.text()
        if (text.trim()) return text
      } catch (error) {
        console.warn('Failed to read grant source markdown:', error)
      }
    }

    const metadata = document.metadata || {}
    const lines = [
      metadata.abstract || metadata.summary || document.notes || 'Grant document registered from ScholarLib. Add summary, reviewer feedback, and outcome details as they become available.',
      '',
      '## Source',
      '',
      `- Document ID: ${document.id}`,
    ]
    if (document.filename) lines.push(`- File: ${document.filename}`)
    if (document.box_path) lines.push(`- Storage path: ${document.box_path}`)
    return lines.join('\n')
  }

  buildBody(body, reviewerFeedback) {
    const lines = ['# Grant Summary', '', String(body || '').trim()]
    if (reviewerFeedback) {
      lines.push('', '## Reviewer Feedback', '', String(reviewerFeedback).trim())
    }
    return `${lines.join('\n').trim()}\n`
  }
}
