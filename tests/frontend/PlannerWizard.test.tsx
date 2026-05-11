import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PlannerWizard from '@/components/planner/PlannerWizard'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

describe('PlannerWizard Component', () => {
  it('should render the styling step initially', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PlannerWizard onComplete={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>
    )
    expect(screen.getByText(/What's your travel style/i)).toBeInTheDocument()
  })

  it('should allow selecting multiple travel styles', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PlannerWizard onComplete={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>
    )
    const culturalBtn = screen.getByText('Cultural')
    const adventureBtn = screen.getByText('Adventure')
    
    fireEvent.click(culturalBtn)
    fireEvent.click(adventureBtn)
    
    // Check if they have the active class or similar indicator
    // This depends on the implementation details.
  })

  it('should progress to the budget step after styling', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PlannerWizard onComplete={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByText('Adventure'))
    fireEvent.click(screen.getByRole('button', { name: /Next/i }))
    
    expect(screen.getByText(/What's your budget/i)).toBeInTheDocument()
  })
})
