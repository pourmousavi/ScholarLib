import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProposalReviewMinimal from '../ProposalReviewMinimal'
import PageReader from '../PageReader'

const proposal = {
  proposal_id: 'prop_test',
  source: { title: 'Paper', doi: '10/test' },
  page_changes: [
    { change_id: 'low', operation: 'create', page_type: 'paper', risk_tier: 'low', risk_reason: 'paper', draft_body: 'Low', draft_frontmatter: {}, claims_added: [] },
    { change_id: 'high', operation: 'modify', page_type: 'concept', risk_tier: 'high', risk_reason: 'verifier', draft_body: 'High', draft_frontmatter: {}, claims_added_unsupported: [{ claim_text: 'Bad claim' }] },
  ],
}

describe('wiki components', () => {
  it('renders proposal changes and approve-low-risk excludes high risk', async () => {
    render(<ProposalReviewMinimal proposal={proposal} adapter={{}} onApplied={vi.fn()} />)
    expect(screen.getByText('Paper')).toBeTruthy()
    expect(screen.getByText('Bad claim')).toBeTruthy()
    fireEvent.click(screen.getByText('Approve all low-risk'))
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes[0].checked).toBe(true)
    expect(boxes[1].checked).toBe(false)
  })

  it('renders ID wikilinks as clickable targets', () => {
    render(<PageReader body="See [[c_01JX7K4EXX5C9V7F2QY4Y8K9DA|calendar aging]]" pagesById={{ c_01JX7K4EXX5C9V7F2QY4Y8K9DA: { title: 'Calendar Aging' } }} />)
    expect(screen.getByRole('button', { name: 'calendar aging' })).toBeTruthy()
  })
})
