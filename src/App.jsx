import { useEffect, useState, useRef } from 'react'
import AppShell from './components/layout/AppShell'
import StorageSetup from './components/layout/StorageSetup'
import { ToastContainer, Spinner, OfflineBanner, IOSInstallPrompt } from './components/ui'
import { useToastStore, useToast } from './hooks/useToast'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { usePWAInstall } from './hooks/usePWAInstall'
import { useStorageStore } from './store/storageStore'
import { useLibraryStore } from './store/libraryStore'
import { LibraryService } from './services/library/LibraryService'
import { indexService } from './services/indexing/IndexService'
import { PortalProvider } from './contexts/PortalContext'

function ToastProvider({ children }) {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  return (
    <>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  )
}

function AppContent() {
  const [isInitializing, setIsInitializing] = useState(true)
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)

  const { isOffline } = useOnlineStatus()
  const { showIOSPrompt, dismissIOSPrompt } = usePWAInstall()

  const initialize = useStorageStore((s) => s.initialize)
  const handleCallback = useStorageStore((s) => s.handleCallback)
  const isConnected = useStorageStore((s) => s.isConnected)
  const isConnecting = useStorageStore((s) => s.isConnecting)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)
  const adapter = useStorageStore((s) => s.adapter)
  const provider = useStorageStore((s) => s.provider)

  const setLibraryData = useLibraryStore((s) => s.setLibraryData)
  const useMockData = useLibraryStore((s) => s.useMockData)
  const libraryConflict = useLibraryStore((s) => s.libraryConflict)
  const clearConflict = useLibraryStore((s) => s.clearConflict)
  const { showToast } = useToast()

  // Track if we've already processed the OAuth callback
  const oauthProcessed = useRef(false)

  // Combined initialization and OAuth callback handling
  useEffect(() => {
    const initializeApp = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      // Check if this is a Box or Dropbox callback
      const isBoxCallback = url.pathname.includes('/auth/box') || url.pathname.endsWith('/ScholarLib/')
      const isDropboxCallback = url.pathname.includes('/auth/dropbox')

      // Handle OAuth callback FIRST if present
      if (code && (isBoxCallback || isDropboxCallback) && !oauthProcessed.current) {
        // Mark as processed and clear URL immediately to prevent re-use
        oauthProcessed.current = true
        window.history.replaceState({}, '', url.pathname)

        try {
          await handleCallback(code, state)
          showToast({ message: 'Connected to storage successfully', type: 'success' })
        } catch (error) {
          showToast({ message: error.message || 'Failed to connect', type: 'error' })
          // Still initialize even if callback failed
          await initialize()
        }
      } else {
        // No OAuth callback, just initialize normally
        await initialize()
      }

      setIsInitializing(false)
    }

    initializeApp()
  }, [handleCallback, showToast, initialize])

  // Show conflict toast when library was modified externally
  useEffect(() => {
    if (libraryConflict) {
      showToast({
        message: 'Your library was updated elsewhere. Refresh to see the latest changes.',
        type: 'warning',
        duration: 0, // persistent
        action: {
          label: 'Reload',
          onClick: async () => {
            clearConflict()
            if (adapter) {
              try {
                const library = await LibraryService.loadLibrary(adapter)
                setLibraryData(library)
                showToast({ message: 'Library reloaded', type: 'success' })
              } catch (e) {
                showToast({ message: 'Failed to reload library', type: 'error' })
              }
            }
          },
        },
      })
    }
  }, [libraryConflict, clearConflict, adapter, setLibraryData, showToast])

  // Load library when connected
  useEffect(() => {
    const loadLibrary = async () => {
      if (!isConnected) return

      // Demo mode: use mock data
      if (isDemoMode) {
        useMockData()
        return
      }

      // Real storage: load from adapter
      if (!adapter) return

      setIsLoadingLibrary(true)
      try {
        const library = await LibraryService.loadLibrary(adapter)
        const result = setLibraryData(library)

        // If orphan tags were synced, save the updated registry
        if (result?.syncedTags > 0) {
          console.log(`Synced ${result.syncedTags} orphan tag(s) into registry, saving...`)
          const library = useLibraryStore.getState().getLibrarySnapshot()
          await LibraryService.saveLibrary(adapter, library)
        }

        // Sync index status with actual index metadata
        // This fixes cases where library.json has stale status
        const { synced } = await indexService.syncIndexStatus(adapter)
        if (synced > 0) {
          console.log(`Synced ${synced} document(s) index status from index metadata`)
        }
      } catch (error) {
        console.error('Failed to load library:', error)
        showToast({ message: 'Failed to load library', type: 'error' })
      } finally {
        setIsLoadingLibrary(false)
      }
    }

    loadLibrary()
  }, [isConnected, isDemoMode, adapter, setLibraryData, useMockData, showToast])

  // Show loading during initialization
  if (isInitializing) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)'
      }}>
        <Spinner size={32} />
      </div>
    )
  }

  // Show storage setup if not connected
  if (!isConnected && !isConnecting) {
    return <StorageSetup />
  }

  // Show loading while connecting or loading library
  if (isConnecting || isLoadingLibrary) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'var(--bg-base)'
      }}>
        <Spinner size={32} />
        <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
          {isConnecting ? 'Connecting to storage...' : 'Loading library...'}
        </span>
      </div>
    )
  }

  return (
    <>
      {isOffline && <OfflineBanner />}
      <AppShell />
      {showIOSPrompt && <IOSInstallPrompt onDismiss={dismissIOSPrompt} />}
    </>
  )
}

export default function App() {
  return (
    <PortalProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </PortalProvider>
  )
}
