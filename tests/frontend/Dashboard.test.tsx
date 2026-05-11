import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Dashboard from '../../client/src/pages/Dashboard'
import { useAuthStore } from '../../client/src/store'

// Mock the useAuthStore
vi.mock('../../client/src/store', () => ({
  useAuthStore: vi.fn(),
  useTripStore: () => ({
    trips: [],
    isLoading: false,
    error: null,
    listTrips: vi.fn()
  })
}))

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { firstName: 'Dhamaru', lastName: 'K', email: 'kasivasi2005@gmail.com' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      error: null
    } as any)
  })

  it('should welcome the user by name', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )
    expect(screen.getByText(/Welcome back, Dhamaru/i)).toBeInTheDocument()
  })

  it('should have a call to action to plan a new trip', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    )
    expect(screen.getByText(/\+ Plan New Trip/i)).toBeInTheDocument()
  })
})
