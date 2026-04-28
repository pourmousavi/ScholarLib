import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { WikiService } from '../WikiService'
import { ProposalStore } from '../proposals/ProposalStore'
import { ReviewDebtCalculator } from '../proposals/ReviewDebtCalculator'

function fakeProposal(id, changes) {
  return {
    proposal_id: id,
    created_at: new Date().toISOString(),
    source: { title: `Paper ${id}` },
    page_changes: changes.map((tier, index) => ({ change_id: `${id}_${index}`, risk_tier: tier })),
  }
}

describe('ReviewDebtCalculator', () => {
  it('computes debt using the documented heuristic', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const store = new ProposalStore(adapter)
    await store.save(fakeProposal('prop_1', ['high', 'medium', 'medium', 'low', 'low', 'low', 'low']))
    const debt = await new ReviewDebtCalculator({ adapter }).computeDebt()
    const expected = (2.0) + (2 * 0.7) + (4 * 0.2)
    expect(debt.total_minutes).toBeCloseTo(expected, 5)
    expect(debt.proposals).toHaveLength(1)
    expect(debt.paused).toBe(false)
  })

  it('flags paused state when total exceeds threshold', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const store = new ProposalStore(adapter)
    for (let i = 0; i < 5; i += 1) {
      await store.save(fakeProposal(`prop_${i}`, Array(8).fill('high')))
    }
    const debt = await new ReviewDebtCalculator({ adapter }).computeDebt()
    expect(debt.total_minutes).toBeGreaterThan(30)
    expect(debt.paused).toBe(true)
  })

  it('blocks ingestion via assertCanIngest when over threshold and allows override with reason', async () => {
    const adapter = new MemoryAdapter()
    await WikiService.initialize(adapter)
    const store = new ProposalStore(adapter)
    for (let i = 0; i < 4; i += 1) {
      await store.save(fakeProposal(`prop_${i}`, Array(10).fill('high')))
    }
    const calc = new ReviewDebtCalculator({ adapter })
    await expect(calc.assertCanIngest()).rejects.toMatchObject({ code: 'WIKI_REVIEW_DEBT_EXCEEDED' })
    await expect(calc.assertCanIngest({ override: true })).rejects.toMatchObject({ code: 'WIKI_REVIEW_OVERRIDE_REQUIRES_REASON' })
    const result = await calc.assertCanIngest({ override: true, reason: 'Critical paper' })
    expect(result.override).toBe(true)
    const overrides = await calc.listOverrides()
    expect(overrides).toHaveLength(1)
    expect(overrides[0].reason).toBe('Critical paper')
  })
})
