import { useCallback } from 'react'
import { create } from 'zustand'
import { nanoid } from 'nanoid'

const useToastStore = create((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = nanoid()
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }]
    }))
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }))
    }, 4000)
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }))
  }
}))

export function useToast() {
  const addToast = useToastStore((state) => state.addToast)

  // Memoize showToast to prevent useEffect re-runs in consumers
  const showToast = useCallback(({ message, type = 'info' }) => {
    addToast({ message, type })
  }, [addToast])

  return { showToast }
}

export { useToastStore }
