/**
 * Safely execute async operations with error handling
 */

/**
 * Execute an async function with retry and error handling
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Options
 * @param {*} options.fallback - Fallback value on error
 * @param {boolean} options.showToast - Whether to show toast on error
 * @param {Function} options.onError - Error callback
 * @param {number} options.retries - Number of retries
 * @param {number} options.retryDelay - Delay between retries in ms
 */
export async function safeLoad(fn, options = {}) {
  const {
    fallback = null,
    showToast = false,
    onError = null,
    retries = 0,
    retryDelay = 1000
  } = options

  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check for specific error types
      if (error.code === 'STORAGE_AUTH_EXPIRED') {
        // Auth expired - should trigger reconnect
        if (onError) onError(error)
        return fallback
      }

      if (error.code === 'STORAGE_RATE_LIMIT') {
        // Rate limited - wait and retry
        const waitTime = error.retryAfter || retryDelay * (attempt + 1)
        await sleep(waitTime)
        continue
      }

      // If we have retries left, wait and try again
      if (attempt < retries) {
        await sleep(retryDelay * (attempt + 1))
        continue
      }
    }
  }

  // All attempts failed
  if (onError) onError(lastError)
  if (showToast && lastError) {
    // Toast will be handled by the caller
    console.error('safeLoad failed:', lastError)
  }

  return fallback
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wrap a function to catch and log errors without throwing
 */
export function catchErrors(fn, fallback = null) {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      console.error('Caught error:', error)
      return fallback
    }
  }
}

/**
 * Execute with timeout
 */
export async function withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
  let timeoutId

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId)
    return result
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}
