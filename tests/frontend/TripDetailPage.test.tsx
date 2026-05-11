import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TripDetail from '../../client/src/pages/TripDetail'
import { useTripStore } from '../../client/src/store'

vi.mock('../../client/src/store', () => ({
  useTripStore: vi.fn()
}))

describe('TripDetailPage', () => {
  it('should render trip details for a specific ID', () => {
    vi.mocked(useTripStore).mockReturnValue({
      activeTrip: {
        id: 'trip-123',
        destination: 'Tokyo',
        startDate: '2025-06-01',
        endDate: '2025-06-07',
        itinerary: []
      },
      isLoading: false
    } as any)

    render(
      <MemoryRouter initialEntries={['/trips/trip-123']}>
        <Routes>
          <Route path="/trips/:id" element={<TripDetail />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText(/June 1/i)).toBeInTheDocument()
  })

  it('should show loading state', () => {
    vi.mocked(useTripStore).mockReturnValue({
      isLoading: true
    } as any)

    render(
      <MemoryRouter initialEntries={['/trips/trip-123']}>
        <Routes>
          <Route path="/trips/:id" element={<TripDetail />} />
        </Routes>
      </MemoryRouter>
    )

    // Check for a spinner or skeleton
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })
})
