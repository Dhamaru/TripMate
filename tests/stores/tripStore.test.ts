import { describe, it, expect } from 'vitest'
import { useTripStore } from '../../client/src/store/tripStore'

describe('Zustand TripStore', () => {
  it('should set and clear the current trip', () => {
    const { setCurrentTrip } = useTripStore.getState()

    const mockTrip = { id: 'test-1', destination: 'Paris', itinerary: [] } as any
    setCurrentTrip(mockTrip)
    expect(useTripStore.getState().currentTrip).toEqual(mockTrip)

    setCurrentTrip(null)
    expect(useTripStore.getState().currentTrip).toBeNull()
  })

  it('should update a single itinerary day on the current trip', () => {
    const { setCurrentTrip, updateItineraryDay } = useTripStore.getState()

    setCurrentTrip({ id: 'test-1', destination: 'Paris', itinerary: [{ dayIndex: 0, activities: [] }] } as any)
    updateItineraryDay(0, { dayIndex: 0, activities: [{ id: 'a1' }] } as any)

    expect(useTripStore.getState().currentTrip?.itinerary[0].activities).toHaveLength(1)
  })
})
