import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Profile from '../../client/src/pages/Profile'
import { useAuthStore } from '../../client/src/store'

vi.mock('../../client/src/hooks/use-auth', () => ({
  useAuth: vi.fn()
}))

describe('ProfilePage', () => {
  it('should display user information', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { firstName: 'Dhamaru', lastName: 'K', email: 'kasivasi2005@gmail.com' },
      isLoading: false
    } as any)

    render(<Profile />)
    expect(screen.getByDisplayValue('Dhamaru')).toBeInTheDocument()
    expect(screen.getByDisplayValue('K')).toBeInTheDocument()
    expect(screen.getByDisplayValue('kasivasi2005@gmail.com')).toBeInTheDocument()
  })

  it('should allow editing preferences', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { firstName: 'Dhamaru', lastName: 'K', email: 'kasivasi2005@gmail.com', preferences: { currency: 'USD' } },
      isLoading: false
    } as any)

    render(<Profile />)
    const currencySelect = screen.getByLabelText(/Preferred Currency/i)
    fireEvent.change(currencySelect, { target: { value: 'EUR' } })
    expect(currencySelect).toHaveValue('EUR')
  })
})
