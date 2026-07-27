import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Home from '../../client/src/pages/Home'
import { useAuthStore, useTripStore } from '../../client/src/store'

// The dashboard page is Home.tsx now (Dashboard.tsx no longer exists).
// It uses wouter, not react-router-dom (never a dependency here), and
// wouter's useLocation/Link work standalone without a Provider wrapper.

vi.mock('../../client/src/store', () => ({
  useAuthStore: vi.fn(),
  useTripStore: vi.fn(),
}))

describe('Home (Dashboard) Page', () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { firstName: 'Dhamaru', lastName: 'K', email: 'kasivasi2005@gmail.com' },
    } as any)
    vi.mocked(useTripStore).mockReturnValue({
      trips: [],
      isLoading: false,
      error: null,
      fetchTrips: vi.fn(),
    } as any)
  })

  it('should greet the user by first name', () => {
    render(<Home />)
    expect(screen.getByText('Dhamaru')).toBeInTheDocument()
  })

  it('should show a call to action to plan a new trip when there are no trips', () => {
    render(<Home />)
    expect(screen.getByText(/Start planning/i)).toBeInTheDocument()
  })
})
