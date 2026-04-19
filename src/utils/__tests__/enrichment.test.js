import { describe, it, expect } from 'vitest'
import { needsEnrichment } from '../enrichment.js'

describe('needsEnrichment', () => {
  it('returns true when DOI exists but volume/issue missing', () => {
    expect(needsEnrichment({
      metadata: { doi: '10.1234/test', title: 'Test', volume: null },
    })).toBe(true)
  })

  it('returns true when DOI exists but pages missing', () => {
    expect(needsEnrichment({
      metadata: { doi: '10.1234/test', volume: '5', issue: '2' },
    })).toBe(true)
  })

  it('returns false when no DOI available', () => {
    expect(needsEnrichment({
      metadata: { title: 'No DOI Paper' },
    })).toBe(false)
  })

  it('returns false when metadata is complete', () => {
    expect(needsEnrichment({
      metadata: {
        doi: '10.1234/test',
        volume: '5',
        issue: '2',
        pages: '10-20',
        authors: [{ first: 'A.', last: 'B.' }],
      },
    })).toBe(false)
  })

  it('returns true when authors are strings instead of objects', () => {
    expect(needsEnrichment({
      metadata: {
        doi: '10.1234/test',
        volume: '5',
        issue: '2',
        pages: '10-20',
        authors: ['John Smith'],
      },
    })).toBe(true)
  })

  it('returns true when authors array is empty', () => {
    expect(needsEnrichment({
      metadata: {
        doi: '10.1234/test',
        volume: '5',
        issue: '2',
        pages: '10-20',
        authors: [],
      },
    })).toBe(true)
  })
})
