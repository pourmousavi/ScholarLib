import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import IngestionChecklist from '../IngestionChecklist'
import QualityDashboard from '../QualityDashboard'
import UsefulnessPrompt from '../UsefulnessPrompt'
import {
  IngestionChecklistService,
  createChecklistRecord,
} from '../../../services/wiki/phase1/IngestionChecklistService'

function buildChecklist(overrides = {}) {
  const checklist = createChecklistRecord({
    paperId: 'p_test01',
    scholarlibDocId: 'd1',
    paperTitle: 'Synthetic Paper',
    ingestedAt: '2026-04-28T01:00:00Z',
  })
  for (const stepName of overrides.successSteps || []) {
    IngestionChecklistService.succeedStep(checklist, stepName, overrides[stepName] || {})
  }
  for (const stepName of overrides.runningSteps || []) {
    IngestionChecklistService.beginStep(checklist, stepName)
  }
  for (const [stepName, error] of overrides.failedSteps || []) {
    IngestionChecklistService.failStep(checklist, stepName, error)
  }
  return checklist
}

describe('IngestionChecklist component', () => {
  it('renders each step with its current status label', () => {
    const checklist = buildChecklist({
      successSteps: ['extract'],
      runningSteps: ['verify_claims'],
      failedSteps: [['build_proposal', new Error('LLM offline')]],
    })
    render(<IngestionChecklist checklist={checklist} />)
    expect(screen.getByText('Extract paper')).toBeTruthy()
    expect(screen.getByText('Verify high-impact claims')).toBeTruthy()
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('LLM offline')).toBeTruthy()
  })

  it('records observations and structured schema issues when the user saves', async () => {
    const checklist = buildChecklist({
      successSteps: ['extract', 'verify_claims', 'build_proposal', 'review', 'apply', 'sidecar_regen'],
    })
    const service = { save: vi.fn().mockImplementation((record) => Promise.resolve(record)) }
    const onSaved = vi.fn()
    render(<IngestionChecklist checklist={checklist} service={service} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('observations'), { target: { value: 'Locator stale on page 4.' } })
    fireEvent.click(screen.getByLabelText('verifier_overzealous'))
    fireEvent.click(screen.getByLabelText('frontmatter_field_missing'))
    fireEvent.click(screen.getByText('Save checklist'))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(service.save).toHaveBeenCalled()
    const saved = service.save.mock.calls[0][0]
    expect(saved.observations).toMatch(/Locator stale/)
    expect(saved.schema_issues_observed.map((entry) => entry.tag).sort()).toEqual([
      'frontmatter_field_missing',
      'verifier_overzealous',
    ])
    expect(onSaved).toHaveBeenCalled()
  })

  it('disables the save button until every step has terminated', () => {
    const checklist = buildChecklist({ successSteps: ['extract'], runningSteps: ['verify_claims'] })
    render(<IngestionChecklist checklist={checklist} />)
    expect(screen.getByText('Save checklist').disabled).toBe(true)
  })
})

describe('QualityDashboard component', () => {
  function fakeChecklist(index, overrides = {}) {
    const checklist = createChecklistRecord({
      paperId: `p_${index}`,
      scholarlibDocId: `d${index}`,
      paperTitle: `Paper ${index}`,
      ingestedAt: `2026-04-${String(index).padStart(2, '0')}T00:00:00Z`,
    })
    IngestionChecklistService.succeedStep(checklist, 'extract', { duration_seconds: 5, cost_usd: 0 })
    IngestionChecklistService.succeedStep(checklist, 'verify_claims', {
      claims_total: overrides.total ?? 4,
      claims_supported: overrides.supported ?? 4,
      claims_weak: overrides.weak ?? 0,
      claims_unsupported: overrides.unsupported ?? 0,
      cost_usd: 0,
    })
    IngestionChecklistService.succeedStep(checklist, 'build_proposal', { page_changes_count: 1 })
    IngestionChecklistService.succeedStep(checklist, 'review', {
      duration_seconds_human: overrides.reviewSeconds ?? 240,
      changes_approved: 1,
    })
    IngestionChecklistService.succeedStep(checklist, 'apply', { op_id: 'op_x' })
    IngestionChecklistService.succeedStep(checklist, 'sidecar_regen', { duration_seconds: 0.4 })
    return checklist
  }

  it('shows a green dashboard when metrics are within thresholds', () => {
    const checklists = [fakeChecklist(1), fakeChecklist(2)]
    render(<QualityDashboard checklists={checklists} usefulnessRatings={[{ rating: 4 }, { rating: 5 }]} />)
    expect(screen.getByText(/2 of 10 papers ingested/)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: /Quality threshold pause/ })).toBeNull()
  })

  it('opens the auto-pause modal and logs an override with reason', async () => {
    const checklists = [
      fakeChecklist(1, { total: 5, supported: 1, weak: 2, unsupported: 2 }),
      fakeChecklist(2, { total: 5, supported: 1, weak: 2, unsupported: 2 }),
    ]
    const onLogOverride = vi.fn().mockResolvedValue({})
    render(
      <QualityDashboard
        checklists={checklists}
        usefulnessRatings={[]}
        onLogOverride={onLogOverride}
        onRunSchemaRevision={vi.fn()}
        onAbandonPhase1={vi.fn()}
      />
    )
    expect(screen.getByText('Ingestion paused')).toBeTruthy()
    fireEvent.click(screen.getByText('Continue without changes'))
    fireEvent.change(screen.getByLabelText(/Justification/), { target: { value: 'verifier mis-tagging' } })
    fireEvent.click(screen.getByText('Log override'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onLogOverride).toHaveBeenCalled()
    expect(onLogOverride.mock.calls[0][0].reason).toBe('verifier mis-tagging')
  })
})

describe('UsefulnessPrompt component', () => {
  it('only renders at the milestone paper counts', () => {
    const { rerender, container } = render(
      <UsefulnessPrompt paperCount={2} existingRatings={[]} service={{ recordRating: vi.fn() }} />
    )
    expect(container.querySelector('aside')).toBeNull()

    rerender(
      <UsefulnessPrompt paperCount={3} existingRatings={[]} service={{ recordRating: vi.fn() }} />
    )
    expect(screen.getByText(/Usefulness check-in/)).toBeTruthy()

    rerender(
      <UsefulnessPrompt
        paperCount={3}
        existingRatings={[{ paper_index: 3 }]}
        service={{ recordRating: vi.fn() }}
      />
    )
    expect(screen.queryByText(/Usefulness check-in/)).toBeNull()
  })

  it('persists rating and comment via the service when submitted', async () => {
    const recordRating = vi.fn().mockResolvedValue({ rating: 4 })
    const onRecorded = vi.fn()
    render(
      <UsefulnessPrompt paperCount={5} existingRatings={[]} service={{ recordRating }} onRecorded={onRecorded} />
    )
    fireEvent.click(screen.getByLabelText('4 stars'))
    fireEvent.change(screen.getByLabelText('comment'), { target: { value: 'Calendar aging concept page used in draft.' } })
    fireEvent.click(screen.getByText('Submit rating'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(recordRating).toHaveBeenCalledWith({ rating: 4, paperIndex: 5, comment: 'Calendar aging concept page used in draft.' })
    expect(onRecorded).toHaveBeenCalled()
  })
})
