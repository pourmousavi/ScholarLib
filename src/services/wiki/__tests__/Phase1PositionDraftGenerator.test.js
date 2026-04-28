import { describe, expect, it, vi } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { WikiService } from '../WikiService'
import { CostEstimator, CostCapExceededError } from '../CostEstimator'
import { ProviderRouter } from '../ProviderRouter'
import { PositionDraftGenerator, PositionDraftGenerationError } from '../positions/PositionDraftGenerator'
import { WikiPaths } from '../WikiPaths'
import { parseWikiMarkdown } from '../WikiMarkdown'

function fakeLibrary() {
  return {
    documents: {
      d1: { id: 'd1', metadata: { title: 'Calendar aging in BESS', abstract: 'Empirical study.' }, wiki: { concepts_touched: ['c_aging'] } },
      d2: { id: 'd2', metadata: { title: 'Cycle aging in BESS', abstract: 'Modelled study.' }, wiki: { concepts_touched: ['c_aging'] } },
      d3: { id: 'd3', metadata: { title: 'Other paper', abstract: 'Unrelated.' }, wiki: { concepts_touched: [] } },
    },
  }
}

function passThroughRouter() {
  const cost = new CostEstimator({ caps: { single_operation_cap_usd: 5, monthly_cost_cap_usd: 50, grant_namespace_cloud_cap_usd: 0 } })
  return new ProviderRouter({ capabilityCheck: { synthesis_grade_local: true }, costEstimator: cost })
}

describe('PositionDraftGenerator', () => {
  it('produces a draft file with correct frontmatter, voice_status, and concept linkage', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const generator = new PositionDraftGenerator({
      adapter,
      providerRouter: passThroughRouter(),
      llmClient: { chat: vi.fn().mockResolvedValue('# Draft body\n\nThis is a position draft.\n\n## Caveats\n- TODO[claim] confirm.') },
    })
    const result = await generator.generate({
      conceptId: 'c_aging',
      theme: 'BESS calendar aging',
      library: fakeLibrary(),
      qualifyingChecklists: [{ paper_id: 'p_1' }, { paper_id: 'p_2' }],
    })

    expect(result.draft_id).toMatch(/^po_/)
    expect(result.draft.path.startsWith(WikiPaths.positionDraftsRoot)).toBe(true)
    const text = (await adapter.readTextWithMetadata(result.draft.path)).text
    const parsed = parseWikiMarkdown(text)
    expect(parsed.frontmatter.voice_status).toBe('draft_requires_human_edit')
    expect(parsed.frontmatter.concept_id).toBe('c_aging')
    expect(parsed.frontmatter.type).toBe('position_draft')
    expect(parsed.frontmatter.auto_generated).toBe(true)
    expect(parsed.body).toMatch(/Caveats/)
  })

  it('refuses generation when no qualifying papers exist for the theme', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const generator = new PositionDraftGenerator({
      adapter,
      providerRouter: passThroughRouter(),
      llmClient: { chat: vi.fn().mockResolvedValue('') },
    })
    await expect(
      generator.generate({ conceptId: 'c_aging', library: fakeLibrary(), qualifyingChecklists: [] })
    ).rejects.toBeInstanceOf(PositionDraftGenerationError)
  })

  it('blocks generation when the cost preflight cap would be exceeded', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const tightRouter = new ProviderRouter({
      capabilityCheck: { synthesis_grade_local: true },
      costEstimator: new CostEstimator({ caps: { single_operation_cap_usd: 0.0001, monthly_cost_cap_usd: 50, grant_namespace_cloud_cap_usd: 0 } }),
    })
    const generator = new PositionDraftGenerator({
      adapter,
      providerRouter: tightRouter,
      llmClient: { chat: vi.fn() },
    })
    await expect(
      generator.generate({ conceptId: 'c_aging', library: fakeLibrary(), qualifyingChecklists: [{ paper_id: 'p_1' }] })
    ).rejects.toBeInstanceOf(CostCapExceededError)
  })

  it('records the user reaction with rating, would_edit_to_keep, and assessments', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const generator = new PositionDraftGenerator({
      adapter,
      providerRouter: passThroughRouter(),
      llmClient: { chat: vi.fn().mockResolvedValue('Body') },
    })
    const review = await generator.recordReview('po_test01', {
      theme: 'c_aging',
      user_rating: 2,
      user_observations: 'Sounds like me but not quite.',
      would_edit_to_keep: 'partially',
      voice_match_assessment: 'tone close, hedging too academic',
      factual_accuracy_assessment: 'one borderline claim flagged',
    })
    expect(review.user_rating).toBe(2)
    expect(review.would_edit_to_keep).toBe('partially')

    const list = await generator.listReviews()
    expect(list).toHaveLength(1)
  })
})
