import { describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../../storage/MemoryAdapter'
import { CostEstimator } from '../CostEstimator'
import { ProviderRouter } from '../ProviderRouter'
import { SensitivityViolationError } from '../SensitivityGate'

describe('wiki ProviderRouter and cost estimator', () => {
  it('blocks sensitive content before cloud prompt assembly', async () => {
    const router = new ProviderRouter({
      capabilityCheck: { synthesis_grade_local: false },
      costEstimator: new CostEstimator(),
    })
    await expect(router.route('extract_paper', {
      sensitivity: 'confidential',
      allowedProviders: ['ollama'],
      estimatedTokensIn: 100,
      estimatedTokensOut: 100,
    })).rejects.toBeInstanceOf(SensitivityViolationError)
  })

  it('allows sensitive content on Ollama', async () => {
    const router = new ProviderRouter({
      capabilityCheck: { synthesis_grade_local: true, models: [{ name: 'llama3.1:8b' }] },
      costEstimator: new CostEstimator(),
    })
    const route = await router.route('extract_paper', {
      sensitivity: 'confidential',
      allowedProviders: ['ollama'],
    })
    expect(route.provider).toBe('ollama')
  })

  it('routes routine extraction to Ollama when local synthesis is available', async () => {
    const router = new ProviderRouter({
      capabilityCheck: { synthesis_grade_local: true, models: [{ name: 'llama3.2:1b' }, { name: 'llama3.1:8b' }] },
      costEstimator: new CostEstimator(),
    })
    const route = await router.route('extract_paper', { sensitivity: 'public' })
    expect(route).toMatchObject({ provider: 'ollama', model: 'llama3.1:8b' })
  })

  it('routes routine extraction to Haiku when local synthesis is unavailable and content is public', async () => {
    const router = new ProviderRouter({
      capabilityCheck: { synthesis_grade_local: false },
      costEstimator: new CostEstimator(),
      settings: { models: { claudeHaiku: 'haiku-configured' } },
    })
    const route = await router.route('extract_paper', { sensitivity: 'public' })
    expect(route).toMatchObject({ provider: 'claude', model: 'haiku-configured' })
  })

  it('routes public extraction to Haiku when cloud fallback is forced', async () => {
    const router = new ProviderRouter({
      capabilityCheck: { synthesis_grade_local: true, models: [{ name: 'llama3.1:8b' }] },
      costEstimator: new CostEstimator(),
    })
    const route = await router.route('extract_paper', { sensitivity: 'public', forceCloudFallback: true })
    expect(route.provider).toBe('claude')
    expect(route.model).toBe('claude-haiku-4-5-20251001')
  })

  it('blocks cost preflight over single and monthly caps', async () => {
    const under = new CostEstimator({ caps: { single_operation_cap_usd: 1, monthly_cost_cap_usd: 2 } })
    expect((await under.checkPreflight({ provider: 'claude', model: 'claude-sonnet', tokensIn: 1000, tokensOut: 1000 })).ok).toBe(true)

    const single = new CostEstimator({ caps: { single_operation_cap_usd: 0.001 } })
    expect((await single.checkPreflight({ provider: 'claude', model: 'claude-sonnet', tokensIn: 1000, tokensOut: 1000 })).reason).toBe('single_operation_cap_exceeded')

    const adapter = new MemoryAdapter()
    const monthly = new CostEstimator({ adapter, caps: { monthly_cost_cap_usd: 0.01, single_operation_cap_usd: 1 } })
    await monthly.recordCall({ provider: 'claude', model: 'claude-sonnet', task: 'verify_claim', tokensIn: 1000, tokensOut: 1000 })
    expect((await monthly.checkPreflight({ provider: 'claude', model: 'claude-sonnet', tokensIn: 1000, tokensOut: 1000 })).reason).toBe('monthly_cap_exceeded')
  })

  it('keeps concurrent immutable cost entries without lost updates', async () => {
    const adapter = new MemoryAdapter()
    const estimator = new CostEstimator({ adapter })
    await Promise.all(Array.from({ length: 100 }, (_, index) =>
      estimator.recordCall({ provider: 'ollama', model: 'local', task: 'classify', metadata: { index } })
    ))
    const running = await estimator.rebuildIndex()
    expect(running.record_count).toBe(100)
  })
})
