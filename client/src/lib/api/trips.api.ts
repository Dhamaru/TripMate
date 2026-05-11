import client from './client'
import type { Trip, CreateTripRequest } from '../../types/api.types'

interface GenerateTripRequest {
    destination: string
    startDate: string
    endDate: string
    totalBudget: number
    currency?: string
    travelStyle: string
    travelMedium: string
    companions: number
    interests?: string[]
}

export const tripsApi = {
    list: () => client.get<Trip[], Trip[]>('/api/v1/trips'),
    get: (id: string) => client.get<Trip, Trip>(`/api/v1/trips/${id}`),
    create: (data: CreateTripRequest) => client.post<Trip, Trip>('/api/v1/trips', data),
    delete: (id: string) => client.delete(`/api/v1/trips/${id}`),
    generateItinerary: (data: GenerateTripRequest) =>
        client.post<{ jobId: string }, { jobId: string }>('/api/v1/trips/generate', data),
    getGenerationStatus: (jobId: string) =>
        client.get<{ status: string; steps: string[]; tripId?: string; error?: string }, { status: string; steps: string[]; tripId?: string; error?: string }>(
            `/api/v1/trips/generate/status/${jobId}`
        ),
    getCollaborators: (tripId: string) =>
        client.get<any[], any[]>(`/api/v1/trips/${tripId}/collaborators`),
    addCollaborator: (tripId: string, data: { email: string, role: string }) =>
        client.post<any, any>(`/api/v1/trips/${tripId}/collaborators`, data),
    removeCollaborator: (tripId: string, collaboratorId: string) =>
        client.delete(`/api/v1/trips/${tripId}/collaborators/${collaboratorId}`),
    toggleVote: (tripId: string, data: { dayIndex: number, activityId: string, vote: number }) =>
        client.post<Trip, Trip>(`/api/v1/trips/${tripId}/itinerary/vote`, data),
}
