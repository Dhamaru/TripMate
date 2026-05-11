import { describe, it, expect } from 'vitest'
import { useTripStore } from '../../client/src/lib/stores/tripStore'

describe('Zustand TripStore', () => {
  it('should set and clear the active trip', () => {
    const { setActiveTrip, activeTrip, clearActiveTrip } = useTripStore.getState()
    
    const mockTrip = { id: 'test-1', destination: 'Paris' } as any
    setActiveTrip(mockTrip)
    expect(useTripStore.getState().activeTrip).toEqual(mockTrip)
    
    clearActiveTrip()
    expect(useTripStore.getState().activeTrip).toBeNull()
  })

  it('should handle itinerary state', () => {
    const { setItinerary } = useTripStore.getState()
    const mockItinerary = [{ dayIndex: 1, activities: [] }] as any
    
    setItinerary(mockItinerary)
    expect(useTripStore.getState().itinerary).toEqual(mockItinerary)
  })
})
