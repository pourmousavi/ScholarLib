import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { PageStore } from '../PageStore'
import { WikiPaths } from '../WikiPaths'
import { ObsidianFormatter } from '../export/ObsidianFormatter'
import { ObsidianExporter } from '../export/ObsidianExporter'
import { GrantIngestion } from '../grants/GrantIngestion'
import { GrantNamespacePolicy } from '../grants/GrantNamespacePolicy'
import { getUningestedGrantDocuments, isGrantDocument } from '../grants/GrantLibraryClassifier'
import { QuestionClusterer } from '../questions/QuestionClusterer'
import { QuestionPromoter } from '../questions/QuestionPromoter'
import { LintService } from '../lint/LintService'
import { IntegrityService } from '../IntegrityService'
import { SidecarService } from '../SidecarService'

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
})
