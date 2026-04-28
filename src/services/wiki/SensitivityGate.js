export class SensitivityViolationError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'SensitivityViolationError'
    this.code = 'WIKI_SENSITIVITY_VIOLATION'
    this.details = details
  }
}

export class SensitivityGate {
  check(sensitivity = 'public', allowedProviders = ['ollama', 'claude', 'openai', 'gemini'], proposedProvider) {
    const isSensitive = sensitivity === 'confidential'
    const allowed = allowedProviders || []
    if (isSensitive && !allowed.includes(proposedProvider)) {
      throw new SensitivityViolationError(
        `Provider ${proposedProvider} is not allowed for confidential wiki content`,
        { sensitivity, allowedProviders: allowed, proposedProvider }
      )
    }
    return true
  }
}
