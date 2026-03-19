import { useEffect, useState } from 'react'
import AppShell from './components/layout/AppShell'
import StorageSetup from './components/layout/StorageSetup'
import { ToastContainer, Spinner } from './components/ui'
import { useToastStore, useToast } from './hooks/useToast'
import { useStorageStore } from './store/storageStore'
import { useLibraryStore } from './store/libraryStore'
import { LibraryService } from './services/library/LibraryService'

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

  const initialize = useStorageStore((s) => s.initialize)
  const handleCallback = useStorageStore((s) => s.handleCallback)
  const isConnected = useStorageStore((s) => s.isConnected)
  const isConnecting = useStorageStore((s) => s.isConnecting)
  const adapter = useStorageStore((s) => s.adapter)
  const provider = useStorageStore((s) => s.provider)

  const setLibraryData = useLibraryStore((s) => s.setLibraryData)
  const { showToast } = useToast()

  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      // Check if this is a Box or Dropbox callback
      const isBoxCallback = url.pathname.includes('/auth/box') || url.pathname.endsWith('/ScholarLib/')
      const isDropboxCallback = url.pathname.includes('/auth/dropbox')

      if (code && (isBoxCallback || isDropboxCallback)) {
        try {
          await handleCallback(code, state)
          // Clear URL params
          window.history.replaceState({}, '', url.pathname)
          showToast({ message: 'Connected to storage successfully', type: 'success' })
        } catch (error) {
          showToast({ message: error.message || 'Failed to connect', type: 'error' })
          window.history.replaceState({}, '', url.pathname)
        }
      }
    }

    handleOAuthCallback()
  }, [handleCallback, showToast])

  // Initialize storage on mount
  useEffect(() => {
    const init = async () => {
      await initialize()
      setIsInitializing(false)
    }
    init()
  }, [initialize])

  // Load library when connected
  useEffect(() => {
    const loadLibrary = async () => {
      if (!isConnected || !adapter) return

      setIsLoadingLibrary(true)
      try {
        const library = await LibraryService.loadLibrary(adapter)
        setLibraryData(library)
      } catch (error) {
        console.error('Failed to load library:', error)
        showToast({ message: 'Failed to load library', type: 'error' })
      } finally {
        setIsLoadingLibrary(false)
      }
    }

    loadLibrary()
  }, [isConnected, adapter, setLibraryData, showToast])

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

  return <AppShell />
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
