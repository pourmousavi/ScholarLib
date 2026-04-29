export class GrantPolicyViolationError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'GrantPolicyViolationError'
    this.code = 'GRANT_POLICY_VIOLATION'
    this.details = details
  }
}

const DEFAULT_ALLOWED_PROVIDERS = ['ollama']
const CLOUD_PROVIDERS = new Set(['claude', 'openai', 'gemini'])

export class GrantNamespacePolicy {
  static defaultFrontmatter(overrides = {}) {
    const now = new Date().toISOString()
    return {
      type: 'grant',
      sensitivity: 'confidential',
      allowed_providers: DEFAULT_ALLOWED_PROVIDERS,
      allowed_storage: ['box_university_account'],
      outcome: 'pending',
      themes: [],
      related_papers: [],
      related_concepts: [],
      schema_version: '1.0',
      scope: 'private',
      share_review_status: 'blocked_sensitive',
      created: now,
      last_updated: now,
      human_edited: false,
      auto_generated: true,
      ...overrides,
      type: 'grant',
      sensitivity: 'confidential',
      scope: 'private',
      share_review_status: 'blocked_sensitive',
    }
  }

  static assertProviderAllowed(provider, allowedProviders = DEFAULT_ALLOWED_PROVIDERS) {
    if (CLOUD_PROVIDERS.has(provider)) {
      throw new GrantPolicyViolationError('Grant content cannot be sent to cloud providers.', { provider })
    }
    if (!allowedProviders.includes(provider) && provider !== 'university_approved') {
      throw new GrantPolicyViolationError(`Provider ${provider} is not allowed for grant content.`, { provider, allowedProviders })
    }
    return true
  }

  static assertPublicPageDoesNotLeakGrant(page) {
    const type = page.frontmatter?.type
    const isPrivateGrant = type === 'grant' || page.path?.includes('/_private/grant/')
    if (isPrivateGrant) return true
    const body = String(page.body || '')
    const hasGrantProseMarker = /reviewer_feedback|funder:|program:|grant pattern|confidential grant/i.test(body)
    const hasAllowedOpaqueReferenceOnly = !hasGrantProseMarker
    if (!hasAllowedOpaqueReferenceOnly) {
      throw new GrantPolicyViolationError('Non-private pages may reference opaque grant IDs only; grant-derived prose is not allowed.', {
        page_id: page.id,
      })
    }
    return true
  }
}
