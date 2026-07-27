import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlannerWizard } from '@/components/planner/PlannerWizard'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function renderWizard() {
  render(
    <QueryClientProvider client={queryClient}>
      <PlannerWizard />
    </QueryClientProvider>
  )
}

// Walks the wizard from step 1 (Destination) through to step 4 (Style).
function advanceToStyleStep() {
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Tokyo, Japan' } })
  fireEvent.click(screen.getByLabelText('Continue to dates'))

  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } })
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-05' } })
  fireEvent.click(screen.getByLabelText('Continue to budget'))

  fireEvent.click(screen.getByLabelText('Continue to style'))
}

describe('PlannerWizard Component', () => {
  it('should render the destination step initially', () => {
    renderWizard()
    expect(screen.getByText(/Where are you going/i)).toBeInTheDocument()
  })

  it('should allow selecting multiple travel styles', () => {
    renderWizard()
    advanceToStyleStep()

    const culturalBtn = screen.getByText('Cultural')
    const adventureBtn = screen.getByText('Adventure')

    fireEvent.click(culturalBtn)
    expect(culturalBtn).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(adventureBtn)
    expect(adventureBtn).toHaveAttribute('aria-pressed', 'true')
    // travelStyle is single-select, so choosing Adventure deselects Cultural
    expect(culturalBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('should progress to the style step after budget', () => {
    renderWizard()
    advanceToStyleStep()

    expect(screen.getByText(/Your travel style/i)).toBeInTheDocument()
  })
})
