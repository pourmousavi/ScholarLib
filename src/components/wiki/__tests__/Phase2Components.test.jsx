import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PageDiffView from '../proposalReview/PageDiffView'
import SourceEvidencePopover from '../proposalReview/SourceEvidencePopover'
import ChangeEditDialog, { detectAliasLinks } from '../proposalReview/ChangeEditDialog'
import RiskTierSection from '../proposalReview/RiskTierSection'
import LintReportView from '../lint/LintReportView'
import RecoveryActions from '../recovery/RecoveryActions'
import { PageDiffer } from '../../../services/wiki/diff/PageDiffer'

describe('PageDiffView', () => {
  it('renders body changes with insert/delete classes', () => {
    const diff = new PageDiffer().diff({ frontmatter: { title: 'A' }, body: 'one\ntwo' }, { title: 'A' }, 'one\nthree')
    const { container } = render(<PageDiffView diff={diff} />)
    expect(container.querySelector('[class*="diffLine_inserted"]')).toBeTruthy()
    expect(container.querySelector('[class*="diffLine_deleted"]')).toBeTruthy()
  })

  it('hides unchanged lines when "show only changes" is toggled', () => {
    const diff = new PageDiffer().diff({ frontmatter: { title: 'A' }, body: 'a\nb\nc' }, { title: 'A' }, 'a\nb\nd')
    const { container, getByLabelText } = render(<PageDiffView diff={diff} />)
    const initialUnchanged = container.querySelectorAll('[class*="diffLine_unchanged"]').length
    fireEvent.click(getByLabelText(/Show only changes/))
    const filteredUnchanged = container.querySelectorAll('[class*="diffLine_unchanged"]').length
    expect(filteredUnchanged).toBeLessThan(initialUnchanged)
  })
})

describe('SourceEvidencePopover', () => {
  it('shows quote and triggers Open PDF callback', () => {
    const onOpenPdf = vi.fn()
    render(
      <SourceEvidencePopover
        claim={{
          claim_text: 'fact',
          scholarlib_doc_id: 'd1',
          supported_by: [{ pdf_page: 4, char_start: 0, char_end: 10, quote_snippet: 'evidence quote' }],
          verifier_status: 'supported',
        }}
        onClose={vi.fn()}
        onOpenPdf={onOpenPdf}
      />
    )
    expect(screen.getByText('evidence quote')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Open PDF/ }))
    expect(onOpenPdf).toHaveBeenCalledWith({ scholarlib_doc_id: 'd1', page: 4 })
  })

  it('hides snippet for sensitive sources', () => {
    render(
      <SourceEvidencePopover
        claim={{ claim_text: 'sensitive', supported_by: [{ pdf_page: 1, quote_snippet: null }] }}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/Snippet hidden/)).toBeTruthy()
  })

  it('dismisses on Escape', () => {
    const onClose = vi.fn()
    render(<SourceEvidencePopover claim={{ supported_by: [{ pdf_page: 1, quote_snippet: 'x' }] }} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ChangeEditDialog', () => {
  const change = {
    change_id: 'ch_1',
    page_type: 'concept',
    draft_frontmatter: { title: 'A' },
    draft_body: 'See [[c_01JX7K4EXX5C9V7F2QY4Y8K9DA]] for details.',
  }

  it('detects alias-style wikilinks in static helper', () => {
    expect(detectAliasLinks('Use [[Calendar Aging]] here.')).toEqual(['Calendar Aging'])
    expect(detectAliasLinks('Use [[c_01JX7K4EXX5C9V7F2QY4Y8K9DA]] here.')).toEqual([])
  })

  it('rejects alias-style edits when saving', () => {
    const onSave = vi.fn()
    render(<ChangeEditDialog change={change} onSave={onSave} onCancel={vi.fn()} />)
    const textarea = screen.getByText(/Body/).parentElement.querySelector('textarea')
    fireEvent.change(textarea, { target: { value: 'See [[Calendar Aging]] here.' } })
    fireEvent.click(screen.getByText('Save edit'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/Alias-style/)
  })

  it('saves edited body when valid', () => {
    const onSave = vi.fn()
    render(<ChangeEditDialog change={change} onSave={onSave} onCancel={vi.fn()} />)
    const textarea = screen.getByText(/Body/).parentElement.querySelector('textarea')
    fireEvent.change(textarea, { target: { value: 'See [[c_01JX7K4EXX5C9V7F2QY4Y8K9DA]] later.' } })
    fireEvent.click(screen.getByText('Save edit'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      edited_body: expect.stringContaining('later.'),
    }))
  })

  it('cancel preserves the original change content', () => {
    const onCancel = vi.fn()
    render(<ChangeEditDialog change={change} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('RiskTierSection', () => {
  function buildChange(id, tier) {
    return { change_id: id, risk_tier: tier, page_type: 'concept', operation: 'modify', risk_reason: 'test', draft_body: '', draft_frontmatter: {} }
  }

  it('low-risk tier collapses by default and shows audit sample only', () => {
    const changes = [buildChange('a', 'low'), buildChange('b', 'low'), buildChange('c', 'low')]
    const auditSample = new Set(['a'])
    const { container } = render(
      <RiskTierSection
        tier="low"
        changes={changes}
        decisions={{ a: 'approved', b: 'approved', c: 'approved' }}
        auditSampleIds={auditSample}
        defaultExpanded={false}
        diffByChangeId={{}}
        evidenceByChangeId={{}}
      />
    )
    expect(container.querySelectorAll('[data-change-id]').length).toBe(1)
    expect(container.querySelector('[data-change-id="a"]')).toBeTruthy()
  })

  it('approve all triggers callback for tier', () => {
    const onApproveAll = vi.fn()
    render(
      <RiskTierSection
        tier="medium"
        changes={[buildChange('a', 'medium')]}
        decisions={{ a: 'pending' }}
        defaultExpanded
        onApproveAll={onApproveAll}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        onShowEvidence={vi.fn()}
        onFocus={vi.fn()}
        diffByChangeId={{}}
        evidenceByChangeId={{}}
      />
    )
    fireEvent.click(screen.getByText('Approve all'))
    expect(onApproveAll).toHaveBeenCalledWith('medium')
  })
})

describe('LintReportView', () => {
  it('renders findings and triggers per-finding fix', () => {
    const onApplyFix = vi.fn()
    render(
      <LintReportView
        findings={[
          { id: 'f1', severity: 'warning', code: 'PAGE_MISSING_FROM_SIDECAR', page_id: 'p1', message: 'missing' },
          { id: 'f2', severity: 'error', code: 'WIKI_SAFETY_MODE', message: 'tripped' },
        ]}
        onApplyFix={onApplyFix}
        onApplyAll={vi.fn()}
      />
    )
    expect(screen.getByText('PAGE_MISSING_FROM_SIDECAR')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Apply fix')[0])
    expect(onApplyFix).toHaveBeenCalled()
  })

  it('shows empty state when there are no findings', () => {
    render(<LintReportView findings={[]} />)
    expect(screen.getByText(/No lint findings/)).toBeTruthy()
  })
})

describe('RecoveryActions', () => {
  it('confirms before invoking accept-and-overwrite', async () => {
    const onAcceptOverwrite = vi.fn().mockResolvedValue({ ok: true })
    render(
      <RecoveryActions
        state={{ safety_mode: true, safety_reason: 'alias collision' }}
        onRunIntegrityCheck={vi.fn().mockResolvedValue({ ok: true })}
        onAcceptOverwrite={onAcceptOverwrite}
      />
    )
    fireEvent.click(screen.getByText('Accept and overwrite'))
    expect(onAcceptOverwrite).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Yes, overwrite'))
    await waitFor(() => expect(onAcceptOverwrite).toHaveBeenCalled())
  })

  it('does not render when state has no safety mode and no integrity history', () => {
    const { container } = render(<RecoveryActions state={{}} onRunIntegrityCheck={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
