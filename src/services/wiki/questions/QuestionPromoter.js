import { ulid } from 'ulid'
import { PageStore, slugify } from '../PageStore'

export class QuestionPromoter {
  constructor({ adapter, pageStore = PageStore } = {}) {
    if (!adapter) throw new Error('QuestionPromoter requires a storage adapter')
    this.adapter = adapter
    this.pageStore = pageStore
  }

  async promoteCluster(cluster, { title = null, status = 'open', related_concepts = [] } = {}) {
    const id = `q_${ulid()}`
    const questionTitle = title || cluster.label || cluster.candidates?.[0]?.candidate_question || 'Open question'
    const sourcePapers = [...new Set((cluster.candidates || []).map(candidate => candidate.source_page).filter(Boolean))]
    const body = [
      `# ${questionTitle}`,
      '',
      '## Source Candidates',
      '',
      ...(cluster.candidates || []).map(candidate => `- ${candidate.candidate_question} (source: [[${candidate.source_page}]])`),
      '',
    ].join('\n')
    return this.pageStore.writePage(this.adapter, {
      id,
      type: 'question',
      title: questionTitle,
      handle: slugify(questionTitle),
      frontmatter: {
        id,
        type: 'question',
        title: questionTitle,
        handle: slugify(questionTitle),
        status,
        source_papers: sourcePapers,
        related_concepts,
        schema_version: '1.0',
        created_at: new Date().toISOString(),
      },
      body,
    })
  }
}
