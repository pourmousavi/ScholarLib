import { create } from 'zustand'

export const useUIStore = create((set) => ({
  activePanel: 'pdf',
  showModal: null,
  sidebarCollapsed: false,
  docListCollapsed: false,
  setActivePanel: (panel) => set({ activePanel: panel }),
  setShowModal: (modal) => set({ showModal: modal }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleDocList: () => set((s) => ({ docListCollapsed: !s.docListCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setDocListCollapsed: (collapsed) => set({ docListCollapsed: collapsed }),
}))
