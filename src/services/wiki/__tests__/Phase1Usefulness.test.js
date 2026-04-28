import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { UsefulnessService, shouldPromptForCheckIn, averageRating, USEFULNESS_MILESTONES } from '../phase1/UsefulnessService'

describe('UsefulnessService', () => {
  it('flags milestones at papers 3, 5, 7, and 10 only', () => {
    expect(USEFULNESS_MILESTONES).toEqual([3, 5, 7, 10])
    expect(shouldPromptForCheckIn(3, [])).toBe(true)
    expect(shouldPromptForCheckIn(4, [])).toBe(false)
    expect(shouldPromptForCheckIn(5, [{ paper_index: 5 }])).toBe(false)
    expect(shouldPromptForCheckIn(7, [{ paper_index: 5 }, { paper_index: 3 }])).toBe(true)
  })

  it('persists ratings with timestamp, paper index, and free-text comment', async () => {
    const adapter = new MemoryAdapter()
    const service = new UsefulnessService({ adapter })
    const record = await service.recordRating({ rating: 4, paperIndex: 3, comment: 'Concept page on calendar aging actually saved time.' })
    expect(record.rating).toBe(4)
    expect(record.recorded_at).toBeTruthy()
    expect(record.comment).toMatch(/calendar aging/)

    const list = await service.listRatings()
    expect(list).toHaveLength(1)
    expect(list[0].paper_index).toBe(3)
  })

  it('clamps ratings into 1-5 and rejects non-numeric input', async () => {
    const adapter = new MemoryAdapter()
    const service = new UsefulnessService({ adapter })
    const record = await service.recordRating({ rating: 7, paperIndex: 5 })
    expect(record.rating).toBe(5)
    await expect(service.recordRating({ rating: 'bad', paperIndex: 5 })).rejects.toThrow(/rating must be/)
  })

  it('handles 0, 1, and many ratings when computing the rolling average', async () => {
    const adapter = new MemoryAdapter()
    const service = new UsefulnessService({ adapter })
    expect(await service.average()).toBeNull()
    await service.recordRating({ rating: 4, paperIndex: 3 })
    expect(await service.average()).toBeCloseTo(4, 6)
    await service.recordRating({ rating: 2, paperIndex: 5, recordedAt: '2026-04-30T00:00:00Z' })
    await service.recordRating({ rating: 3, paperIndex: 7, recordedAt: '2026-05-01T00:00:00Z' })
    expect(await service.average()).toBeCloseTo(3, 6)
    expect(averageRating([{ rating: 4 }, { rating: 5 }])).toBeCloseTo(4.5, 6)
  })
})
