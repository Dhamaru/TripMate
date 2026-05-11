import client from './client'
import type { PackingList, PackingItem } from '../../types/api.types'

export const packingApi = {
    get: (tripId: string) => client.get<PackingList, PackingList>(`/api/v1/packing?tripId=${tripId}`),
    generate: (tripId: string) => client.post<PackingList, PackingList>(`/api/v1/packing/generate/${tripId}`),
    toggleItem: (listId: string, itemId: string) =>
        client.patch<PackingItem, PackingItem>(`/api/v1/packing/${listId}/items/${itemId}/toggle`),
    addItem: (listId: string, item: Omit<PackingItem, 'id' | 'checked'>) =>
        client.post<PackingItem, PackingItem>(`/api/v1/packing/${listId}/items`, item),
    removeItem: (listId: string, itemId: string) =>
        client.delete(`/api/v1/packing/${listId}/items/${itemId}`),
}
