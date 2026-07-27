import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TripCard } from '../../client/src/components/dashboard/TripCard'

// TripCard uses wouter's useLocation, which works standalone without a
// wrapping Router/Provider — no react-router-dom (never a dependency here).

// Mock useTripStore
vi.mock('../../client/src/store', () => ({
    useTripStore: () => ({
        deleteTrip: vi.fn()
    })
}))

// Mock OptimizedImage
vi.mock('../../client/src/components/ui/OptimizedImage', () => ({
    OptimizedImage: ({ alt }: any) => <img alt={alt} />
}))

describe('TripCard Component', () => {
    const mockTrip = {
        id: 'trip-123',
        destination: 'Tokyo',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-07'),
        travelStyle: 'Luxury',
        transportMode: 'Flight',
        groupSize: 2,
        budget: 1500,
        imageUrl: 'https://example.com/tokyo.jpg'
    } as any

    it('should render trip destination and metadata', () => {
        render(<TripCard trip={mockTrip} />)
        expect(screen.getByText('Tokyo')).toBeInTheDocument()
        expect(screen.getByText(/Luxury/i)).toBeInTheDocument()
        expect(screen.getByText(/Flight/i)).toBeInTheDocument()
        expect(screen.getByText(/👥 2/i)).toBeInTheDocument()
    })

    it('should show delete confirmation when trash icon is clicked', () => {
        render(<TripCard trip={mockTrip} />)
        const deleteBtn = screen.getByLabelText(/Delete trip/i)
        fireEvent.click(deleteBtn)

        expect(screen.getByLabelText(/Confirm delete/i)).toBeInTheDocument()
    })
})
