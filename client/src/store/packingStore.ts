// Task 12 — Packing Zustand store
import { create } from 'zustand'
import type { PackingList, PackingItem } from '../types/api.types'
import { packingApi } from '../lib/api'

interface PackingStore {
    packingList: PackingList | null
    isGenerating: boolean
    error: string | null
    generateList: (tripId: string) => Promise<void>
    toggleItem: (listId: string, itemId: string) => Promise<void>
    addItem: (listId: string, item: Omit<PackingItem, 'id' | 'checked'>) => Promise<void>
    removeItem: (listId: string, itemId: string) => Promise<void>
    fetchList: (tripId: string) => Promise<void>
}

export const usePackingStore = create<PackingStore>((set, get) => ({
    packingList: null,
    isGenerating: false,
    error: null,
    fetchList: async (tripId) => {
        try {
            const list = await packingApi.get(tripId)
            set({ packingList: list, error: null })
        } catch {
            // Not found is expected for new trips
        }
    },
    generateList: async (tripId) => {
        set({ isGenerating: true, error: null })
        try {
            const list = await packingApi.generate(tripId)
            set({ packingList: list, isGenerating: false })
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to generate packing list'
            set({ error: msg, isGenerating: false })
            throw e
        }
    },
    toggleItem: async (listId, itemId) => {
        const prev = get().packingList
        if (!prev) return
        // Optimistic update
        set({
            packingList: {
                ...prev,
                categories: prev.categories.map(c => ({
                    ...c,
                    items: c.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i),
                })),
            },
        })
        try {
            await packingApi.toggleItem(listId, itemId)
        } catch {
            // Rollback
            set({ packingList: prev })
        }
    },
    addItem: async (listId, item) => {
        const newItem = await packingApi.addItem(listId, item)
        const prev = get().packingList
        if (!prev) return
        set({
            packingList: {
                ...prev,
                categories: prev.categories.map(c =>
                    c.name === item.category
                        ? { ...c, items: [...c.items, newItem] }
                        : c
                ),
                totalItems: prev.totalItems + 1,
            },
        })
    },
    removeItem: async (listId, itemId) => {
        await packingApi.removeItem(listId, itemId)
        const prev = get().packingList
        if (!prev) return
        set({
            packingList: {
                ...prev,
                categories: prev.categories.map(c => ({
                    ...c,
                    items: c.items.filter(i => i.id !== itemId),
                })),
                totalItems: Math.max(0, prev.totalItems - 1),
            },
        })
    },
}))
