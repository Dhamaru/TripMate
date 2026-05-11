// Task 8 — Unit tests for the budget calculation logic in AiUtilitiesService
/** @vitest-environment node */
import { describe, it, expect } from 'vitest'
import { AiUtilitiesService } from '../../AiUtilitiesService'

const service = new AiUtilitiesService()

describe('Budget Engine — AiUtilitiesService.calculateBudgetBreakdown', () => {
    it('allocates correct amounts for Adventure style', async () => {
        const result = await service.calculateBudgetBreakdown(3000, 'Adventure')
        expect(result.buffer).toBe(300) // 10% of 3000
        const allocatableTotal = result.accommodation + result.food + result.transport + result.activities
        expect(allocatableTotal).toBe(2700)
        expect(result.total).toBe(3000)
    })

    it('all category fields are present', async () => {
        const result = await service.calculateBudgetBreakdown(1000, 'Budget')
        expect(result).toHaveProperty('accommodation')
        expect(result).toHaveProperty('food')
        expect(result).toHaveProperty('transport')
        expect(result).toHaveProperty('activities')
        expect(result).toHaveProperty('buffer')
        expect(result).toHaveProperty('total')
    })

    it('all TravelStyle values return valid breakdown summing to ~90% of budget', async () => {
        const styles = ['Luxury', 'Adventure', 'Budget', 'Relaxed', 'Cultural']
        for (const style of styles) {
            const result = await service.calculateBudgetBreakdown(1000, style)
            const allocatable = result.accommodation + result.food + result.transport + result.activities
            // Allow ±2 for rounding
            expect(allocatable).toBeGreaterThanOrEqual(898)
            expect(allocatable).toBeLessThanOrEqual(902)
        }
    })

    it('smaller budget still produces non-negative allocations', async () => {
        const result = await service.calculateBudgetBreakdown(100, 'Budget')
        expect(result.accommodation).toBeGreaterThanOrEqual(0)
        expect(result.food).toBeGreaterThanOrEqual(0)
        expect(result.transport).toBeGreaterThanOrEqual(0)
        expect(result.activities).toBeGreaterThanOrEqual(0)
        expect(result.buffer).toBe(10)
    })

    it('Luxury style allocates highest proportion to accommodation', async () => {
        const lux = await service.calculateBudgetBreakdown(1000, 'Luxury')
        const budget = await service.calculateBudgetBreakdown(1000, 'Budget')
        expect(lux.accommodation).toBeGreaterThan(budget.accommodation)
    })

    it('Adventure style allocates highest proportion to transport+activities', async () => {
        const adv = await service.calculateBudgetBreakdown(1000, 'Adventure')
        const relax = await service.calculateBudgetBreakdown(1000, 'Relaxed')
        expect(adv.transport + adv.activities).toBeGreaterThan(relax.transport + relax.activities)
    })
})
