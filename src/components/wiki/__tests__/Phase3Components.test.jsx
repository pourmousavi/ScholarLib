import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BootstrapList from '../bootstrap/BootstrapList'
import QualityDashboard from '../QualityDashboard'
import { createEmptyPlan } from '../../../services/wiki/bootstrap/BootstrapPlanService'

function buildPlan(overrides = {}) {
  return {
    ...createEmptyPlan(),
    ...overrides,
  }
}

const sampleLibrary = {
  documents: {
    'doc-1': { id: 'doc-1', metadata: { title: 'Calendar Aging in BESS', authors: ['Pourmousavi'] } },
    'doc-2': { id: 'doc-2', metadata: { title: 'FCAS Revenue Streams', authors: ['Pourmousavi'] } },
    'doc-3': { id: 'doc-3', metadata: { title: 'External Anchor Paper', authors: ['Karpathy'] } },
  },
}

function makeService(initial) {
  let state = initial || createEmptyPlan()
  return {
    loadPlan: vi.fn(async () => state),
    addPaper: vi.fn(async (section, scholarlibDocId, theme, extra = {}) => {
      const order = state[section].length + 1
      const entry = {
        scholarlib_doc_id: scholarlibDocId,
        order,
        theme,
        notes: extra.notes || '',
        status: 'queued',
        paper_page_id: null,
        ingested_at: null,
      }
      if (section === 'external_anchors') entry.why_anchor = extra.why_anchor || ''
      state = {
        ...state,
        [section]: [...state[section], entry],
        themes: state.themes.includes(theme) ? state.themes : [...state.themes, theme],
      }
      return state
    }),
    removePaper: vi.fn(async (section, docId) => {
      state = {
        ...state,
        [section]: state[section]
          .filter((entry) => entry.scholarlib_doc_id !== docId)
          .map((entry, index) => ({ ...entry, order: index + 1 })),
      }
      return state
    }),
    reorder: vi.fn(async (section, docId, target) => {
      const entries = state[section].slice()
      const idx = entries.findIndex((entry) => entry.scholarlib_doc_id === docId)
      const [removed] = entries.splice(idx, 1)
      entries.splice(Math.max(0, target - 1), 0, removed)
      state = {
        ...state,
        [section]: entries.map((entry, index) => ({ ...entry, order: index + 1 })),
      }
      return state
    }),
    setStatus: vi.fn(async (section, docId, status) => {
      state = {
        ...state,
        [section]: state[section].map((entry) =>
          entry.scholarlib_doc_id === docId ? { ...entry, status } : entry
        ),
      }
      return state
    }),
  }
}

describe('BootstrapList component', () => {
  it('renders both columns with empty state and progress', () => {
    render(<BootstrapList initialPlan={createEmptyPlan()} library={sampleLibrary} />)
    expect(screen.getByText('My papers')).toBeTruthy()
    expect(screen.getByText('External anchors')).toBeTruthy()
    expect(screen.getAllByText(/No papers added yet/).length).toBe(2)
    expect(screen.getByText(/own-papers ingested/, { selector: 'div' })).toBeTruthy()
  })

  it('adds a paper through the dialog', async () => {
    const service = makeService()
    render(<BootstrapList initialPlan={createEmptyPlan()} library={sampleLibrary} service={service} />)
    const ownColumn = screen.getByLabelText('My papers')
    fireEvent.click(within(ownColumn).getByText('Add paper'))
    fireEvent.change(screen.getByLabelText('new theme'), { target: { value: 'calendar-aging' } })
    fireEvent.click(screen.getByText('Calendar Aging in BESS'))
    await waitFor(() => expect(service.addPaper).toHaveBeenCalled())
    expect(service.addPaper.mock.calls[0][0]).toBe('own_papers')
    expect(service.addPaper.mock.calls[0][1]).toBe('doc-1')
    expect(service.addPaper.mock.calls[0][2]).toBe('calendar-aging')
  })

  it('shows mid-bootstrap migration banner when schema revision is available and not yet taken', () => {
    const onTake = vi.fn()
    const onSkip = vi.fn()
    render(
      <QualityDashboard
        phase="phase3"
        checklists={[]}
        schemaRevisionAvailable
        schemaRevisionTaken={false}
        onTakeMidBootstrapSchemaRevision={onTake}
        onSkipMidBootstrapSchemaRevision={onSkip}
      />
    )
    const banner = screen.getByLabelText('mid-bootstrap schema revision')
    expect(banner).toBeTruthy()
    expect(within(banner).getByText('Mid-bootstrap schema revision check')).toBeTruthy()
    fireEvent.click(within(banner).getByText('Run revision'))
    expect(onTake).toHaveBeenCalled()
    fireEvent.click(within(banner).getByText('Skip — schema is good'))
    expect(onSkip).toHaveBeenCalled()
  })

  it('hides the mid-bootstrap banner once the revision is taken', () => {
    render(
      <QualityDashboard
        phase="phase3"
        checklists={[]}
        schemaRevisionAvailable
        schemaRevisionTaken
      />
    )
    expect(screen.queryByLabelText('mid-bootstrap schema revision')).toBeNull()
  })

  it('blocks the external column status from changing while own-papers are pending', async () => {
    const initial = {
      ...createEmptyPlan(),
      own_papers: [
        { scholarlib_doc_id: 'doc-1', order: 1, theme: 'theme', status: 'queued' },
      ],
      external_anchors: [
        { scholarlib_doc_id: 'doc-3', order: 1, theme: 'theme', status: 'queued', why_anchor: '' },
      ],
      themes: ['theme'],
    }
    render(<BootstrapList initialPlan={initial} library={sampleLibrary} service={makeService(initial)} />)
    expect(screen.getByText(/External anchors are gated until/)).toBeTruthy()
    const externalSelect = screen.getByLabelText('status for doc-3')
    expect(externalSelect.disabled).toBe(true)
  })
})
