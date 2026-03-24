import { createContext, useContext, useState, useEffect } from 'react'

const PortalContext = createContext(null)

export function PortalProvider({ children, containerRef }) {
  const [portalContainer, setPortalContainer] = useState(document.body)

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        // In fullscreen mode, use the fullscreen element as portal container
        setPortalContainer(document.fullscreenElement)
      } else {
        // Not in fullscreen, use document.body
        setPortalContainer(document.body)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    // Also handle webkit prefix for Safari
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

    // Check initial state
    handleFullscreenChange()

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  return (
    <PortalContext.Provider value={portalContainer}>
      {children}
    </PortalContext.Provider>
  )
}

export function usePortalContainer() {
  const container = useContext(PortalContext)
  // Fallback to document.body if context not available
  return container || document.body
}
