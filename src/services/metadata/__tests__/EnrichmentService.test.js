import { describe, it, expect, vi } from 'vitest'

vi.mock('../CrossRefService.js', () => ({
  CrossRefService: {
    lookup: vi.fn(),
  },
}))

vi.mock('../OpenAlexService.js', () => ({
  OpenAlexService: {
    lookupByDOI: vi.fn(),
  },
}))

import { enrichFromDOI } from '../EnrichmentService.js'
import { CrossRefService } from '../CrossRefService.js'
import { OpenAlexService } from '../OpenAlexService.js'

describe('enrichFromDOI', () => {
  it('returns merged metadata from CrossRef and OpenAlex', async () => {
    vi.mocked(CrossRefService.lookup).mockResolvedValue({
      volume: '357',
      issue: '2',
      pages: '122-138',
      authors: [{ first: 'Y.', last: 'Zhang' }],
      type: 'journal-article',
    })

    vi.mocked(OpenAlexService.lookupByDOI).mockResolvedValue({
      citation_count: 42,
      open_access_url: 'https://example.com/paper.pdf',
    })

    const result = await enrichFromDOI('10.1016/j.apenergy.2024.01.042')

    expect(result.volume).toBe('357')
    expect(result.issue).toBe('2')
    expect(result.pages).toBe('122-138')
    expect(result.citation_count).toBe(42)
    expect(result.extraction_source).toBe('litorbit+crossref')
  })

  it('succeeds even when OpenAlex fails', async () => {
    vi.mocked(CrossRefService.lookup).mockResolvedValue({
      volume: '10',
      authors: [{ first: 'A.', last: 'Smith' }],
    })
    vi.mocked(OpenAlexService.lookupByDOI).mockRejectedValue(new Error('timeout'))

    const result = await enrichFromDOI('10.1234/test')

    expect(result.volume).toBe('10')
    expect(result.citation_count).toBeUndefined()
  })

  it('returns null when both services return nothing', async () => {
    vi.mocked(CrossRefService.lookup).mockResolvedValue(null)
    vi.mocked(OpenAlexService.lookupByDOI).mockResolvedValue(null)

    const result = await enrichFromDOI('10.1234/nonexistent')

    expect(result).toBeNull()
  })
})
