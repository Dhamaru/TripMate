// Task 9 — Unit tests for client-side itinerary chronological validation utility
import { describe, it, expect } from 'vitest'
import { validateChronologicalOrder } from '../../../client/src/utils/itineraryValidation'
import type { Activity } from '../../../client/src/types/api.types'

const makeActivity = (id: string, time: string, title: string): Activity => ({
    id,
    time,
    title,
    location: 'Test Location',
    type: 'activity',
    lat: 0,
    lng: 0,
})

describe('validateChronologicalOrder', () => {
    it('returns valid for empty array', () => {
        expect(validateChronologicalOrder([])).toEqual({ valid: true })
    })

    it('returns valid for single activity', () => {
        expect(validateChronologicalOrder([makeActivity('1', '09:00', 'Breakfast')])).toEqual({ valid: true })
    })

    it('returns valid for correctly ordered activities', () => {
        const activities = [
            makeActivity('1', '09:00', 'Breakfast'),
            makeActivity('2', '12:00', 'Lunch'),
            makeActivity('3', '19:00', 'Dinner'),
        ]
        expect(validateChronologicalOrder(activities)).toEqual({ valid: true })
    })

    it('returns invalid when later-time activity placed before earlier-time activity', () => {
        const activities = [
            makeActivity('1', '15:00', 'Museum'),
            makeActivity('2', '10:00', 'Walking tour'),
        ]
        const result = validateChronologicalOrder(activities)
        expect(result.valid).toBe(false)
        expect(result.conflict).toBeDefined()
        expect(result.conflict?.activityA.title).toBeDefined()
    })

    it('returns invalid for same-time activities', () => {
        const activities = [
            makeActivity('1', '10:00', 'Breakfast'),
            makeActivity('2', '10:00', 'Hotel checkout'),
        ]
        const result = validateChronologicalOrder(activities)
        expect(result.valid).toBe(false)
        expect(result.conflict?.reason).toContain('10:00')
    })

    it('returns valid for large correctly ordered set', () => {
        const activities = [
            makeActivity('1', '07:00', 'Morning run'),
            makeActivity('2', '09:00', 'Breakfast'),
            makeActivity('3', '11:00', 'Museum visit'),
            makeActivity('4', '13:00', 'Lunch'),
            makeActivity('5', '15:00', 'City tour'),
            makeActivity('6', '19:00', 'Dinner'),
        ]
        expect(validateChronologicalOrder(activities)).toEqual({ valid: true })
    })
})
