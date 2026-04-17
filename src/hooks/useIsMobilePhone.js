import { useState, useEffect } from 'react'

/**
 * useIsMobilePhone - Returns true on touch devices (phones and tablets).
 * Annotation tools require a mouse and aren't usable on touch screens.
 */
export function useIsMobilePhone() {
  const [isTouch, setIsTouch] = useState(() => detectTouchDevice())

  useEffect(() => {
    const handleResize = () => setIsTouch(detectTouchDevice())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isTouch
}

function detectTouchDevice() {
  // ontouchstart exists on all iOS and Android devices
  if ('ontouchstart' in window) return true
  // Coarse pointer = finger-based input
  if (window.matchMedia('(pointer: coarse)').matches) return true
  return false
}
