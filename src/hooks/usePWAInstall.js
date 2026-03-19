import { useState, useEffect } from 'react'

/**
 * Hook to handle PWA installation prompt
 * Returns install state and methods for both Chrome (beforeinstallprompt)
 * and iOS Safari (manual instructions)
 */
export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isIOSPromptDismissed, setIsIOSPromptDismissed] = useState(false)

  useEffect(() => {
    // Check if already installed as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (isStandalone) {
      setIsInstalled(true)
      return
    }

    // Check if iOS
    const ua = navigator.userAgent
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
    setIsIOS(isIOSDevice)

    // Check if iOS prompt was dismissed
    const dismissed = localStorage.getItem('sv_ios_install_dismissed')
    if (dismissed) {
      setIsIOSPromptDismissed(true)
    }

    // Listen for beforeinstallprompt (Chrome, Edge, etc.)
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const install = async () => {
    if (!installPrompt) return false

    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice

    if (outcome === 'accepted') {
      setInstallPrompt(null)
      return true
    }

    return false
  }

  const dismissIOSPrompt = () => {
    localStorage.setItem('sv_ios_install_dismissed', 'true')
    setIsIOSPromptDismissed(true)
  }

  return {
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    install,
    // iOS-specific
    isIOS,
    showIOSPrompt: isIOS && !isInstalled && !isIOSPromptDismissed,
    dismissIOSPrompt
  }
}
