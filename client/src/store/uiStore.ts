import { create } from 'zustand'

interface UiStore {
    activePanel: string | null
    currentPage: string
    setActivePanel: (panel: string | null) => void
    setCurrentPage: (page: string) => void
}

export const useUiStore = create<UiStore>((set) => ({
    activePanel: null,
    currentPage: 'dashboard',
    setActivePanel: (panel) => set({ activePanel: panel }),
    setCurrentPage: (page) => set({ currentPage: page }),
}))
