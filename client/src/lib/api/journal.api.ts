import client from './client'
import type { JournalEntry } from '../../types/api.types'

export const journalApi = {
    list: (tripId: string) => client.get<JournalEntry[], JournalEntry[]>(`/api/v1/journal?tripId=${tripId}`),
    create: (data: { text: string; tripId: string; entryDate: string; images?: string[] }) =>
        client.post<JournalEntry, JournalEntry>('/api/v1/journal', data),
    update: (id: string, data: Partial<JournalEntry>) =>
        client.put<JournalEntry, JournalEntry>(`/api/v1/journal/${id}`, data),
    delete: (id: string) => client.delete(`/api/v1/journal/${id}`),
    contextualize: (id: string) =>
        client.post<JournalEntry, JournalEntry>(`/api/v1/journal/${id}/contextualize`),
    enhance: (id: string) =>
        client.post<{ enhanced: string; changesSummary: string; original: string }, { enhanced: string; changesSummary: string; original: string }>(
            `/api/v1/journal/${id}/enhance`
        ),
    confirmEnhancement: (id: string, text: string) =>
        client.post<JournalEntry, JournalEntry>(`/api/v1/journal/${id}/enhance/confirm`, { text }),
    generateRecap: (tripId: string) =>
        client.post<{ recap: JournalEntry }, { recap: JournalEntry }>(`/api/v1/journal/recap/${tripId}`),
}
