/**
 * Device Detection Utility
 * Detects device type for per-device settings
 */

export const DEVICE_TYPES = {
  DESKTOP: 'desktop',
  TABLET: 'tablet',
  MOBILE: 'mobile'
}

/**
 * Detect current device type based on screen size and user agent
 * @returns {string} 'desktop' | 'tablet' | 'mobile'
 */
export function getDeviceType() {
  const ua = navigator.userAgent.toLowerCase()
  const width = window.innerWidth

  // Check user agent for mobile/tablet indicators
  const isMobileUA = /iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)
  const isTabletUA = /ipad|android(?!.*mobile)|tablet/i.test(ua)

  // Combine UA detection with screen width
  if (isMobileUA || (width < 640 && 'ontouchstart' in window)) {
    return DEVICE_TYPES.MOBILE
  }

  if (isTabletUA || (width >= 640 && width < 1024 && 'ontouchstart' in window)) {
    return DEVICE_TYPES.TABLET
  }

  return DEVICE_TYPES.DESKTOP
}

/**
 * Get human-readable device name
 * @param {string} deviceType
 * @returns {string}
 */
export function getDeviceName(deviceType) {
  switch (deviceType) {
    case DEVICE_TYPES.MOBILE:
      return 'Phone'
    case DEVICE_TYPES.TABLET:
      return 'Tablet'
    case DEVICE_TYPES.DESKTOP:
    default:
      return 'Desktop'
  }
}

/**
 * Check if WebLLM is suitable for this device
 * WebLLM requires significant memory and WebGPU support
 * @returns {boolean}
 */
export function isWebLLMSuitable() {
  const deviceType = getDeviceType()

  // WebLLM is only suitable on desktop
  if (deviceType !== DEVICE_TYPES.DESKTOP) {
    return false
  }

  // Check for WebGPU support
  if (!('gpu' in navigator)) {
    return false
  }

  return true
}

/**
 * Get recommended AI providers for a device type
 * @param {string} deviceType
 * @returns {Array<{id: string, name: string, reason: string}>}
 */
export function getRecommendedProviders(deviceType) {
  switch (deviceType) {
    case DEVICE_TYPES.MOBILE:
      return [
        { id: 'gemini', name: 'Gemini API', reason: 'Google AI, generous free tier' },
        { id: 'claude', name: 'Claude API', reason: 'Best quality, cloud-based (no device resources needed)' },
        { id: 'openai', name: 'OpenAI API', reason: 'Fast responses, cloud-based' },
        { id: 'none', name: 'Disabled', reason: 'Save battery and data' }
      ]
    case DEVICE_TYPES.TABLET:
      return [
        { id: 'gemini', name: 'Gemini API', reason: 'Google AI, generous free tier' },
        { id: 'claude', name: 'Claude API', reason: 'Best quality, cloud-based' },
        { id: 'openai', name: 'OpenAI API', reason: 'Fast responses, cloud-based' },
        { id: 'ollama', name: 'Ollama', reason: 'If running Ollama server on your network' },
        { id: 'none', name: 'Disabled', reason: 'Save battery and data' }
      ]
    case DEVICE_TYPES.DESKTOP:
    default:
      return [
        { id: 'ollama', name: 'Ollama', reason: 'Free, private, runs locally' },
        { id: 'webllm', name: 'WebLLM', reason: 'Free, runs in browser (requires WebGPU)' },
        { id: 'claude', name: 'Claude API', reason: 'Best quality, requires API key' },
        { id: 'openai', name: 'OpenAI API', reason: 'Fast, requires API key' },
        { id: 'gemini', name: 'Gemini API', reason: 'Google AI, generous free tier' },
        { id: 'none', name: 'Disabled', reason: 'Disable AI features' }
      ]
  }
}
