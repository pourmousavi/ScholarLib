import { useState, useEffect } from 'react'

/**
 * useIsTouchDevice - Returns true on touch-only devices (phones and tablets).
 * Annotation tools require a mouse and aren't practical on touch screens.
 * Uses multiple signals: pointer capability, touch support, and screen size.
 */
export function useIsMobilePhone() {
  const [isTouch, setIsTouch] = useState(() => detectTouchDevice())

  useEffect(() => {
    const handleResize = () => {
      setIsTouch(detectTouchDevice())
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isTouch
}

function detectTouchDevice() {
  // Primary pointer is coarse (finger) rather than fine (mouse)
  if (window.matchMedia('(pointer: coarse)').matches) {
    return true
  }

  // Fallback: touch support + no mouse-like pointer
  if ('ontouchstart' in window && !window.matchMedia('(any-pointer: fine)').matches) {
    return true
  }

  return false
}
