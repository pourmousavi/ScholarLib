import { ProviderRouter } from '../ProviderRouter'

export class ClaimVerifier {
  constructor({ providerRouter, llmClient, pdfTextExtractor } = {}) {
    this.providerRouter = providerRouter || new ProviderRouter()
    this.llmClient = llmClient || { chat: async () => '{"status":"unverified","justification":"No verifier configured"}' }
    this.pdfTextExtractor = pdfTextExtractor
  }

  async verifyClaim(claim, scholarlibDocId, adapter, context = {}) {
    const route = await this.providerRouter.route('verify_claim', {
      sensitivity: context.sensitivity || 'public',
      allowedProviders: context.allowedProviders || ['ollama', 'claude'],
      estimatedTokensIn: 1000,
      estimatedTokensOut: 200,
      namespace: context.namespace || '',
    })

    if (route.provider === 'ollama' && context.sensitivity === 'confidential') {
      return { status: 'unverified_due_to_policy', verifier_model: route.model, justification: 'Cloud verification blocked by sensitivity policy', locator_stale: false }
    }

    const evidence = claim.supported_by?.[0]
    const prompt = `Claim: ${claim.claim_text}\nEvidence: ${evidence?.quote_snippet || 'redacted'}\nReturn JSON { "status": "supported|weakly_supported|unsupported|unverified", "justification": "..." }.`
    const raw = await this.llmClient.chat([{ role: 'user', content: prompt }], route.model, route.callOptions)
    let parsed
    try { parsed = JSON.parse(raw) } catch { parsed = { status: 'unverified', justification: String(raw).slice(0, 300) } }
    return {
      status: parsed.status || 'unverified',
      verifier_model: route.model,
      justification: parsed.justification || '',
      locator_stale: false,
    }
  }
}
