import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import {
  CHECKLIST_STEP_NAMES,
  IngestionChecklistService,
  createChecklistRecord,
  getSchemaIssueVocabulary,
  normalizeSchemaIssues,
  transitionStep,
} from '../phase1/IngestionChecklistService'

function fakeChecklist() {
  return createChecklistRecord({
    paperId: 'p_test01',
    scholarlibDocId: 'd1',
    paperTitle: 'Synthetic Paper',
    schemaVersionAtIngestion: '1.0',
    ingestedAt: '2026-04-28T01:00:00Z',
  })
}

describe('IngestionChecklistService', () => {
  it('creates a checklist with all six pending steps', () => {
    const checklist = fakeChecklist()
    expect(checklist.steps).toHaveLength(CHECKLIST_STEP_NAMES.length)
    for (const step of checklist.steps) {
      expect(step.status).toBe('pending')
      expect(CHECKLIST_STEP_NAMES).toContain(step.name)
    }
    expect(checklist.observations).toBe('')
    expect(checklist.schema_issues_observed).toEqual([])
  })

  it('transitions steps through running, success, failed and accumulates errors', () => {
    const checklist = fakeChecklist()
    IngestionChecklistService.beginStep(checklist, 'extract')
    expect(checklist.steps.find((step) => step.name === 'extract').status).toBe('running')
    IngestionChecklistService.succeedStep(checklist, 'extract', { duration_seconds: 12.5, model_used: 'ollama:llama3.1:8b', tokens: 4200, cost_usd: 0 })
    expect(checklist.steps.find((step) => step.name === 'extract').status).toBe('success')
    IngestionChecklistService.failStep(checklist, 'verify_claims', new Error('verifier offline'))
    const verify = checklist.steps.find((step) => step.name === 'verify_claims')
    expect(verify.status).toBe('failed')
    expect(verify.errors).toContain('verifier offline')
  })

  it('rejects unknown step names and unknown statuses', () => {
    const checklist = fakeChecklist()
    expect(() => transitionStep(checklist, 'invent', 'success')).toThrow(/Unknown checklist step/)
    expect(() => transitionStep(checklist, 'extract', 'cancelled')).toThrow(/Invalid checklist status/)
  })

  it('persists and re-reads a fully populated checklist record', async () => {
    const adapter = new MemoryAdapter()
    const service = new IngestionChecklistService({ adapter })
    const checklist = fakeChecklist()
    IngestionChecklistService.succeedStep(checklist, 'extract', { duration_seconds: 9, cost_usd: 0 })
    IngestionChecklistService.succeedStep(checklist, 'verify_claims', {
      claims_total: 3,
      claims_supported: 2,
      claims_weak: 1,
      claims_unsupported: 0,
      cost_usd: 0.04,
    })
    IngestionChecklistService.succeedStep(checklist, 'build_proposal', { page_changes_count: 1, candidates_count: 2 })
    IngestionChecklistService.succeedStep(checklist, 'review', {
      duration_seconds_human: 240,
      changes_approved: 1,
      changes_edited: 0,
      changes_rejected: 0,
    })
    IngestionChecklistService.succeedStep(checklist, 'apply', { op_id: 'op_xx', duration_seconds: 1.5 })
    IngestionChecklistService.succeedStep(checklist, 'sidecar_regen', { duration_seconds: 0.4 })

    IngestionChecklistService.recordObservations(checklist, 'Verifier was conservative.', ['verifier_overzealous', 'frontmatter_field_missing'], false)
    await service.save(checklist)

    const reloaded = await service.load(checklist.paper_id)
    expect(reloaded).toBeTruthy()
    expect(reloaded.observations).toBe('Verifier was conservative.')
    expect(reloaded.schema_issues_observed).toHaveLength(2)
    expect(reloaded.schema_issues_observed[0].vocabulary).toBe('standard')
    expect(reloaded.steps.every((step) => step.status === 'success')).toBe(true)
    expect(IngestionChecklistService.totalCostUsd(reloaded)).toBeCloseTo(0.04, 6)

    const list = await service.listAll()
    expect(list).toHaveLength(1)
  })

  it('normalises schema issues into structured records, dedupes, and tags custom entries', () => {
    const issues = normalizeSchemaIssues(['verifier_overzealous', 'verifier_overzealous', { tag: 'custom_thing', note: 'edge case' }, ''])
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({ tag: 'verifier_overzealous', vocabulary: 'standard' })
    expect(issues[1]).toMatchObject({ tag: 'custom_thing', note: 'edge case', vocabulary: 'custom' })
    expect(getSchemaIssueVocabulary().includes('verifier_overzealous')).toBe(true)
  })
})
