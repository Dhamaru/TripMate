import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TripDetail from '../../client/src/pages/TripDetail'
import { useTripStore, useAuthStore, useAgentStore } from '../../client/src/store'

// TripDetail reads the :id param via wouter's useParams (not react-router-dom,
// never a dependency here) and trip data from useTripStore().currentTrip
// (not "activeTrip"). The header renders destination/days/budget, not
// startDate/endDate — there's no date text on this view.
vi.mock('wouter', async () => {
  const actual = await vi.importActual<typeof import('wouter')>('wouter')
  return {
    ...actual,
    useParams: () => ({ id: 'trip-123' }),
  }
})

vi.mock('../../client/src/store', () => ({
  useTripStore: vi.fn(),
  useAuthStore: vi.fn(),
  useAgentStore: vi.fn(() => ({ setContext: vi.fn() })),
}))

function renderTripDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <TripDetail />
    </QueryClientProvider>
  )
}

describe('TripDetailPage', () => {
  it('should render trip details for a specific ID', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { firstName: 'Test' },
      isLoading: false,
      isAuthenticated: true,
    } as any)
    vi.mocked(useTripStore).mockReturnValue({
      currentTrip: {
        id: 'trip-123',
        destination: 'Tokyo',
        days: 6,
        budget: 1500,
        groupSize: 2,
        travelStyle: 'cultural',
        itinerary: [],
      },
      fetchTrip: vi.fn(),
      isLoading: false,
      error: null,
      deleteTrip: vi.fn(),
    } as any)

    renderTripDetail()

    expect(screen.getByTestId('trip-title')).toHaveTextContent('Tokyo')
    // "6 days" appears both in the header and the stats grid
    expect(screen.getAllByText(/6 days/i).length).toBeGreaterThan(0)
  })

  it('should show loading state', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: true,
    } as any)
    vi.mocked(useTripStore).mockReturnValue({
      currentTrip: null,
      fetchTrip: vi.fn(),
      isLoading: true,
      error: null,
      deleteTrip: vi.fn(),
    } as any)

    renderTripDetail()

    expect(screen.getByText(/Loading trip details/i)).toBeInTheDocument()
  })
})
