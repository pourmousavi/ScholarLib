import { useState, useEffect } from 'react'
import { getDeviceType, DEVICE_TYPES } from '../utils/deviceDetection'

/**
 * useIsMobilePhone - Returns true if the device is a phone (not tablet/desktop).
 * Re-evaluates on window resize to handle orientation changes.
 */
export function useIsMobilePhone() {
  const [isMobile, setIsMobile] = useState(() => getDeviceType() === DEVICE_TYPES.MOBILE)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(getDeviceType() === DEVICE_TYPES.MOBILE)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}
