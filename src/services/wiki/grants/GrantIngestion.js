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

  buildBody(body, reviewerFeedback) {
    const lines = ['# Grant Summary', '', String(body || '').trim()]
    if (reviewerFeedback) {
      lines.push('', '## Reviewer Feedback', '', String(reviewerFeedback).trim())
    }
    return `${lines.join('\n').trim()}\n`
  }
}
