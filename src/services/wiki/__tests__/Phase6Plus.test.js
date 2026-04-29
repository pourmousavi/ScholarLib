import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { PageStore } from '../PageStore'
import { WikiPaths } from '../WikiPaths'
import { ObsidianFormatter } from '../export/ObsidianFormatter'
import { ObsidianExporter } from '../export/ObsidianExporter'
import { GrantIngestion, replaceOrAppendSection } from '../grants/GrantIngestion'
import { GrantNamespacePolicy } from '../grants/GrantNamespacePolicy'
import { getUningestedGrantDocuments, isGrantDocument } from '../grants/GrantLibraryClassifier'
import { QuestionClusterer } from '../questions/QuestionClusterer'
import { QuestionPromoter } from '../questions/QuestionPromoter'
import { LintService } from '../lint/LintService'
import { IntegrityService } from '../IntegrityService'
import { SidecarService } from '../SidecarService'
import { WikiRetrieval } from '../chat/WikiRetrieval'

async function seedPages(adapter) {
  await PageStore.writePage(adapter, {
    id: 'c_aging',
    type: 'concept',
    title: 'BESS calendar aging',
    handle: 'bess-calendar-aging',
    aliases: ['calendar aging'],
    frontmatter: { type: 'concept', title: 'BESS calendar aging', handle: 'bess-calendar-aging', content_hash: 'internal' },
    body: 'Concept links to [[p_smith|Smith paper]].\n\n```scholarlib-claim\nid: cl_1\nclaim_text: Aging increases.\n```',
  })
  await PageStore.writePage(adapter, {
    id: 'p_smith',
    type: 'paper',
    title: 'Smith 2025',
    handle: 'smith-2025',
    frontmatter: { type: 'paper', title: 'Smith 2025', handle: 'smith-2025' },
    body: 'Paper body.',
  })
}

describe('Phase 6+ post-trust extensions', () => {
  it('formats Obsidian wikilinks, strips internal frontmatter, and converts fences', async () => {
    const adapter = new MemoryAdapter()
    await seedPages(adapter)
    const pages = await PageStore.listPages(adapter)
    const concept = pages.find(page => page.id === 'c_aging')
    const md = new ObsidianFormatter({ pages }).formatPage(concept)
    expect(md).toContain('[[smith-2025|Smith paper]]')
    expect(md).not.toContain('content_hash')
    expect(md).toContain('> [!quote] claim')
  })

  it('exports an Obsidian vault and removes stale files through the manifest', async () => {
    const adapter = new MemoryAdapter()
    await seedPages(adapter)
    await adapter.writeTextIfRevision(`${WikiPaths.obsidianExportRoot}/stale.md`, 'old', null)
    await adapter.writeJSON(WikiPaths.obsidianExportManifest, { files: [`${WikiPaths.obsidianExportRoot}/stale.md`] })
    const manifest = await new ObsidianExporter({ adapter }).export()
    expect(manifest.page_count).toBe(2)
    expect(await adapter.readTextWithMetadata(`${WikiPaths.obsidianExportRoot}/index.md`)).toBeTruthy()
    await expect(adapter.readTextWithMetadata(`${WikiPaths.obsidianExportRoot}/stale.md`)).rejects.toMatchObject({ code: 'STORAGE_NOT_FOUND' })
  })

  it('writes grants to the private namespace and blocks cloud providers', async () => {
    const adapter = new MemoryAdapter()
    await expect(new GrantIngestion({ adapter }).ingestGrant({
      title: 'Confidential ARC proposal',
      body: 'private',
      provider: 'claude',
    })).rejects.toMatchObject({ code: 'GRANT_POLICY_VIOLATION' })

    const page = await new GrantIngestion({ adapter }).ingestGrant({
      title: 'Confidential ARC proposal',
      body: 'private',
      provider: 'ollama',
      funder: 'ARC',
    })
    expect(page.path).toContain('_wiki/_private/grant')
    expect(page.frontmatter).toMatchObject({ sensitivity: 'confidential', scope: 'private', share_review_status: 'blocked_sensitive' })
  })

  it('classifies grant folders and ingests grant documents with source metadata', async () => {
    const adapter = new MemoryAdapter()
    await adapter.uploadFile('sources/grant.md', new Blob(['A confidential proposal summary.']))
    const folders = [
      { id: 'f_root', parent_id: null, name: 'Research' },
      { id: 'f_grants', parent_id: 'f_root', name: 'Grants', kind: 'grant' },
      { id: 'f_child', parent_id: 'f_grants', name: 'ARC' },
    ]
    const document = {
      id: 'd_grant',
      folder_id: 'f_child',
      filename: 'arc-proposal.pdf',
      box_path: 'PDFs/arc-proposal.pdf',
      ai_chat_source_file: 'sources/grant.md',
      metadata: { title: 'ARC Discovery Proposal', funder: 'ARC', program: 'Discovery' },
      user_data: { tags: ['bess'] },
    }

    expect(isGrantDocument(document, folders)).toBe(true)
    expect(getUningestedGrantDocuments({ d_grant: document }, folders)).toHaveLength(1)

    const page = await new GrantIngestion({ adapter }).ingestDocument(document)
    expect(page.path).toContain('_wiki/_private/grant')
    expect(page.frontmatter).toMatchObject({
      type: 'grant',
      title: 'ARC Discovery Proposal',
      funder: 'ARC',
      source_doc_id: 'd_grant',
      source_box_path: 'PDFs/arc-proposal.pdf',
    })
    expect(page.body).toContain('A confidential proposal summary.')
  })

  it('lint flags grant-derived prose on public pages', async () => {
    const adapter = new MemoryAdapter()
    await PageStore.writePage(adapter, {
      id: 'c_public',
      type: 'concept',
      title: 'Public Concept',
      body: 'This contains confidential grant pattern prose.',
    })
    const result = await new LintService({ adapter }).runAll({ rules: ['grant_namespace_leakage'] })
    expect(result.findings[0]).toMatchObject({ rule: 'grant_namespace_leakage', severity: 'high' })
    expect(() => GrantNamespacePolicy.assertPublicPageDoesNotLeakGrant({
      id: 'c_public',
      frontmatter: { type: 'concept' },
      body: 'reviewer_feedback: copied',
    })).toThrow()
  })

  it('clusters question candidates and promotes a canonical question page', async () => {
    const adapter = new MemoryAdapter()
    await PageStore.writePage(adapter, {
      id: 'p_questions',
      type: 'paper',
      title: 'Question Paper',
      body: '```scholarlib-question-candidate\nid: qc_1\ncandidate_question: How does calendar aging interact with cycling?\n```\n\n```scholarlib-question-candidate\nid: qc_2\ncandidate_question: How does calendar aging combine with cycling in BESS economics?\n```',
    })
    const pages = await PageStore.listPages(adapter)
    const clusterer = new QuestionClusterer()
    const clusters = clusterer.cluster(clusterer.collectCandidates(pages), { threshold: 0.2 })
    expect(clusters).toHaveLength(1)

    const question = await new QuestionPromoter({ adapter }).promoteCluster(clusters[0])
    expect(question.path).toContain('_wiki/question')
    expect(question.frontmatter.type).toBe('question')
    expect(question.body).toContain('Source Candidates')
  })

  it('regenerating sidecars clears PAGE_MISSING_FROM_SIDECAR for grant pages on next integrity check', async () => {
    const adapter = new MemoryAdapter()
    await new GrantIngestion({ adapter }).ingestGrant({
      title: 'Stale-sidecar grant',
      body: 'private',
      provider: 'ollama',
      funder: 'ARC',
    })
    await new GrantIngestion({ adapter }).ingestGrant({
      title: 'Second grant',
      body: 'private',
      provider: 'ollama',
      funder: 'ARC',
    })
    await adapter.writeJSON(WikiPaths.pagesSidecar, {
      version: '0A',
      generated_at: new Date().toISOString(),
      count: 0,
      pages: [],
      hash: 'sha256:stale',
    })

    const stale = await IntegrityService.check(adapter)
    const staleGrantWarnings = stale.issues.filter(
      (issue) => issue.code === 'PAGE_MISSING_FROM_SIDECAR' && issue.page_id?.startsWith('g_')
    )
    expect(staleGrantWarnings).toHaveLength(2)

    await SidecarService.regenerate(adapter)
    const fresh = await IntegrityService.check(adapter)
    const remainingGrantWarnings = fresh.issues.filter(
      (issue) => issue.code === 'PAGE_MISSING_FROM_SIDECAR' && issue.page_id?.startsWith('g_')
    )
    expect(remainingGrantWarnings).toHaveLength(0)
  })

  it('updates grant fields and preserves unrelated body sections', async () => {
    const adapter = new MemoryAdapter()
    const created = await new GrantIngestion({ adapter }).ingestGrant({
      title: 'Outcome grant',
      provider: 'ollama',
      body: '## Generated Application Summary\n\nSummary.\n\n## Reviewer Feedback\n\nOld\n\n## Outcome Notes\n\nOld notes\n\n## Extra\n\nKeep me.',
    })

    const updated = await new GrantIngestion({ adapter }).updateGrantFields(created.id, {
      outcome: 'rejected',
      reviewer_feedback: 'Reviewer 1: too risky.',
      outcome_notes: 'Resubmit next round.',
    })

    expect(updated.frontmatter).toMatchObject({
      outcome: 'rejected',
      reviewer_feedback: 'Reviewer 1: too risky.',
      human_edited: true,
    })
    expect(updated.frontmatter.last_human_review).toBeTruthy()
    expect(updated.body).toContain('## Reviewer Feedback\n\nReviewer 1: too risky.')
    expect(updated.body).toContain('## Outcome Notes\n\nResubmit next round.')
    expect(updated.body).toContain('## Extra\n\nKeep me.')
  })

  it('attachRelatedDocument records related source docs without extracting when disabled', async () => {
    const adapter = new MemoryAdapter()
    const created = await new GrantIngestion({ adapter }).ingestGrant({
      title: 'Attachment grant',
      provider: 'ollama',
      body: '## Generated Application Summary\n\nSummary.',
    })
    const library = {
      documents: {
        d_notice: {
          id: 'd_notice',
          filename: 'notice.txt',
          metadata: { title: 'Outcome notice' },
        },
      },
    }

    const updated = await new GrantIngestion({ adapter }).attachRelatedDocument(created.id, 'd_notice', {
      relation: 'outcome_notice',
      extractBody: false,
      library,
    })

    expect(updated.frontmatter.related_source_docs).toEqual([
      expect.objectContaining({
        scholarlib_doc_id: 'd_notice',
        relation: 'outcome_notice',
        title: 'Outcome notice',
      }),
    ])
    expect(updated.body).not.toContain('Outcome Notes (from')
  })

  it('attachRelatedDocument populates reviewer feedback and outcome notes from text files', async () => {
    const adapter = new MemoryAdapter()
    await adapter.uploadFile('sources/review.txt', new Blob(['Reviewer 1: strong fit.']))
    await adapter.uploadFile('sources/notice.txt', new Blob(['Outcome: not funded this round.']))
    const created = await new GrantIngestion({ adapter }).ingestGrant({
      title: 'Text attachment grant',
      provider: 'ollama',
      body: '## Reviewer Feedback\n\n\n## Outcome Notes\n\n',
    })
    const library = {
      documents: {
        d_review: { id: 'd_review', filename: 'review.txt', box_path: 'sources/review.txt', metadata: { title: 'Review text' } },
        d_notice: { id: 'd_notice', filename: 'notice.txt', box_path: 'sources/notice.txt', metadata: { title: 'Notice text' } },
      },
    }

    const withFeedback = await new GrantIngestion({ adapter }).attachRelatedDocument(created.id, 'd_review', {
      relation: 'reviewer_feedback',
      extractBody: true,
      library,
    })
    const withNotice = await new GrantIngestion({ adapter }).attachRelatedDocument(created.id, 'd_notice', {
      relation: 'outcome_notice',
      extractBody: true,
      library,
    })

    expect(withFeedback.frontmatter.reviewer_feedback).toContain('Reviewer 1: strong fit.')
    expect(withFeedback.body).toContain('## Reviewer Feedback')
    expect(withFeedback.body).toContain('Reviewer 1: strong fit.')
    expect(withNotice.body).toContain('## Outcome Notes')
    expect(withNotice.body).toContain('Outcome: not funded this round.')
  })

  it('archives grant pages instead of deleting them', async () => {
    const adapter = new MemoryAdapter()
    const created = await new GrantIngestion({ adapter }).ingestGrant({
      title: 'Mistaken grant',
      provider: 'ollama',
      body: 'Not actually a grant application.',
    })

    const archived = await new GrantIngestion({ adapter }).archiveGrantPage(created.id, {
      archive_reason: 'mistake',
    })

    expect(archived.frontmatter).toMatchObject({
      archived: true,
      archive_reason: 'mistake',
      human_edited: true,
    })
    expect(await PageStore.readPage(adapter, created.id)).toBeTruthy()
  })

  it('ingestDocument returns the existing grant on matching source_doc_id', async () => {
    const adapter = new MemoryAdapter()
    await adapter.uploadFile('sources/grant.md', new Blob(['Summary.']))
    const document = {
      id: 'd_dup',
      filename: 'dup.pdf',
      ai_chat_source_file: 'sources/grant.md',
      metadata: { title: 'Duplicate grant' },
    }
    const first = await new GrantIngestion({ adapter }).ingestDocument(document)
    const second = await new GrantIngestion({ adapter }).ingestDocument(document)

    expect(second.alreadyIngested).toBe(true)
    expect(second.id).toBe(first.id)
    expect(second.page.id).toBe(first.id)
  })

  it('replaceOrAppendSection replaces existing headings and appends missing headings', () => {
    const replaced = replaceOrAppendSection('Intro\n\n## Outcome Notes\n\nOld\n\n## Extra\n\nKeep', 2, 'Outcome Notes', 'New')
    expect(replaced).toContain('## Outcome Notes\n\nNew')
    expect(replaced).toContain('## Extra\n\nKeep')

    const appended = replaceOrAppendSection('Intro', 2, 'Reviewer Feedback', 'Feedback')
    expect(appended).toContain('Intro')
    expect(appended).toContain('## Reviewer Feedback\n\nFeedback')
  })

  it('lint flags missing archive targets and unknown related source documents', async () => {
    const adapter = new MemoryAdapter()
    await PageStore.writePage(adapter, {
      id: 'c_archived',
      type: 'concept',
      title: 'Archived Concept',
      frontmatter: { type: 'concept', title: 'Archived Concept', archived: true, superseded_by: 'c_missing' },
      body: 'Archived.',
    })
    await PageStore.writePage(adapter, {
      id: 'g_related',
      type: 'grant',
      title: 'Related Grant',
      frontmatter: {
        type: 'grant',
        title: 'Related Grant',
        related_source_docs: [{ scholarlib_doc_id: 'd_missing', relation: 'outcome_notice', title: 'Missing' }],
      },
      body: 'Grant.',
    })

    const result = await new LintService({ adapter, options: { library: { documents: {} } } }).runAll({
      rules: ['archived_target_missing', 'related_source_doc_unknown', 'orphan_pages'],
    })

    expect(result.findings.map((finding) => finding.rule)).toContain('archived_target_missing')
    expect(result.findings.map((finding) => finding.rule)).toContain('related_source_doc_unknown')
    expect(result.findings.find((finding) => finding.rule === 'orphan_pages' && finding.page_id === 'c_archived')).toBeUndefined()
  })

  it('wiki retrieval excludes archived pages by default', async () => {
    const adapter = new MemoryAdapter()
    await PageStore.writePage(adapter, {
      id: 'c_live',
      type: 'concept',
      title: 'Live Battery Concept',
      frontmatter: { type: 'concept', title: 'Live Battery Concept' },
      body: 'battery live concept',
    })
    await PageStore.writePage(adapter, {
      id: 'c_old',
      type: 'concept',
      title: 'Old Battery Concept',
      frontmatter: { type: 'concept', title: 'Old Battery Concept', archived: true },
      body: 'battery old concept',
    })

    const result = await new WikiRetrieval().retrieve('battery concept', { type: 'library' }, { adapter })
    expect(result.pages.map((page) => page.id)).toContain('c_live')
    expect(result.pages.map((page) => page.id)).not.toContain('c_old')
  })
})
