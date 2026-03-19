import { useState, useEffect } from 'react'
import AppShell from './components/layout/AppShell'
import { ToastContainer } from './components/ui'
import { useToastStore } from './hooks/useToast'

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

function ErrorBoundary({ children }) {
  const [hasError, setHasError] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleError = (event) => {
      setHasError(true)
      setError(event.error?.message || event.message || 'Unknown error')
      event.preventDefault()
    }
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [])

  if (hasError) {
    return (
      <div style={{ padding: 40, color: '#f87171', background: '#0f1117', height: '100vh' }}>
        <h1 style={{ marginBottom: 16 }}>Something went wrong</h1>
        <pre style={{ color: '#e2e4e9' }}>{error}</pre>
      </div>
    )
  }

  return children
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </ErrorBoundary>
  )
}
