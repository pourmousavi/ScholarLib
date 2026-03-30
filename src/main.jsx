import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/layout/ErrorBoundary'
import { AnnotationService } from './services/annotations'
import { useStorageStore } from './store/storageStore'
import { useAnnotationStore } from './store/annotationStore'

// Expose debug utilities for clearing annotations
window.scholarlib = {
  clearAllAnnotations: async () => {
    const adapter = useStorageStore.getState().adapter
    if (!adapter) {
      console.error('No storage adapter connected. Please connect to Box/Dropbox first.')
      return
    }
    await AnnotationService.clearAllAnnotations(adapter)
    // Also clear the store
    useAnnotationStore.getState().setAnnotationsCache({})
    console.log('All annotations cleared successfully. Refresh the page to see changes.')
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
