import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { queryClient } from '../../client/src/lib/queryClient'
import Profile from '../../client/src/pages/Profile'

// Profile.tsx fetches its data via react-query from /api/v1/auth/user with
// no explicit queryFn — it relies on the app's global default queryFn
// (getQueryFn, keyed off the queryKey as a URL), so tests must use the real
// queryClient singleton rather than a bare `new QueryClient()`, which has
// no fetcher and would hang the query forever.
// It also does not read from useAuthStore, and there is no "preferences"
// object on the User model (only flat fields like firstName/lastName/homeCity).
beforeEach(() => {
  queryClient.clear()
})

function renderProfile() {
  render(
    <QueryClientProvider client={queryClient}>
      <Profile />
    </QueryClientProvider>
  )
}

describe('ProfilePage', () => {
  it('should display user information', async () => {
    server.use(
      http.get('*/api/v1/auth/user', () =>
        HttpResponse.json({ firstName: 'Dhamaru', lastName: 'K', email: 'kasivasi2005@gmail.com' })
      )
    )

    renderProfile()
    expect(await screen.findByDisplayValue('Dhamaru')).toBeInTheDocument()
    expect(screen.getByDisplayValue('K')).toBeInTheDocument()
    expect(screen.getByDisplayValue('kasivasi2005@gmail.com')).toBeInTheDocument()
  })

  it('should allow editing the first name field', async () => {
    server.use(
      http.get('*/api/v1/auth/user', () =>
        HttpResponse.json({ firstName: 'Dhamaru', lastName: 'K', email: 'kasivasi2005@gmail.com' })
      )
    )

    renderProfile()
    const firstNameInput = await screen.findByDisplayValue('Dhamaru')
    fireEvent.change(firstNameInput, { target: { value: 'Dhruv' } })
    expect(firstNameInput).toHaveValue('Dhruv')
  })
})
