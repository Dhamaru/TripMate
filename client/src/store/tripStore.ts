import { create } from 'zustand'
import type { Trip, CreateTripRequest } from '../types/api.types'
import { tripsApi } from '../lib/api'

interface TripStore {
    trips: Trip[]
    currentTrip: Trip | null
    isLoading: boolean
    error: string | null
    fetchTrips: () => Promise<void>
    fetchTrip: (id: string) => Promise<void>
    createTrip: (data: CreateTripRequest) => Promise<Trip>
    deleteTrip: (id: string) => Promise<void>
    setCurrentTrip: (trip: Trip | null) => void
    updateItineraryDay: (dayIndex: number, day: Trip['itinerary'][0]) => void
}

export const useTripStore = create<TripStore>((set, get) => ({
    trips: [],
    currentTrip: null,
    isLoading: false,
    error: null,
    fetchTrips: async () => {
        set({ isLoading: true, error: null })
        try {
            const trips = await tripsApi.list()
            set({ trips: Array.isArray(trips) ? trips : [], isLoading: false })
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to fetch trips'
            set({ error: msg, isLoading: false })
        }
    },
    fetchTrip: async (id) => {
        set({ isLoading: true })
        try {
            const trip = await tripsApi.get(id)
            set({ currentTrip: trip, isLoading: false })
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to fetch trip'
            set({ error: msg, isLoading: false })
        }
    },
    createTrip: async (data) => {
        const trip = await tripsApi.create(data)
        set((state) => ({ trips: [trip, ...state.trips] }))
        return trip
    },
    deleteTrip: async (id) => {
        const previous = get().trips
        set((state) => ({ trips: state.trips.filter(t => t.id !== id) }))
        try {
            await tripsApi.delete(id)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to delete'
            set({ trips: previous, error: msg })
        }
    },
    setCurrentTrip: (trip) => set({ currentTrip: trip }),
    updateItineraryDay: (dayIndex, day) => set((state) => {
        if (!state.currentTrip) return state
        const itinerary = [...state.currentTrip.itinerary]
        itinerary[dayIndex] = day
        return { currentTrip: { ...state.currentTrip, itinerary } }
    }),
}))
