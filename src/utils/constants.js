/**
 * Application constants
 */

export const APP_VERSION = '1.0.0'
export const LIBRARY_VERSION = '1.0'

// Embedding configuration
export const EMBEDDING_VERSION = 'v1'
export const EMBEDDING_DIMS = 768
export const MAX_CHUNK_SIZE = 512
export const CHUNK_OVERLAP = 50
export const TOP_K_SEARCH = 12

// AI configuration
export const OLLAMA_BASE_URL = 'http://localhost:11434'
export const WEBLLM_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC'

// File limits
export const MAX_PDF_SIZE_MB = 200
export const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024

// API configuration
export const CROSSREF_API_URL = 'https://api.crossref.org/works'
export const SEMANTIC_SCHOLAR_API_URL = 'https://api.semanticscholar.org/graph/v1/paper'

// Storage keys
export const STORAGE_KEYS = {
  DEVICE_ID: 'sv_device_id',
  AI_PROVIDER: 'sv_ai_provider',
  AI_MODEL: 'sv_ai_model',
  CLAUDE_KEY: 'sv_claude_key',
  OPENAI_KEY: 'sv_openai_key',
  THEME: 'sv_theme',
  IOS_INSTALL_DISMISSED: 'sv_ios_install_dismissed'
}

// Timeout configurations (ms)
export const TIMEOUTS = {
  AI_RESPONSE: 30000,
  API_REQUEST: 10000,
  OLLAMA_CHECK: 3000
}

// Cache durations (seconds)
export const CACHE_DURATIONS = {
  CROSSREF: 86400,      // 1 day
  SEMANTIC_SCHOLAR: 86400,
  FONTS: 31536000       // 1 year
}
