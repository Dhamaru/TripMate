// Task 5 — Chronological order validation for itinerary drag-and-drop

import type { ItineraryActivity } from '../types/api.types'

export interface ValidationResult {
    valid: boolean
    conflict?: {
        activityA: ItineraryActivity
        activityB: ItineraryActivity
        reason: string
    }
}

function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
}

export function validateChronologicalOrder(activities: ItineraryActivity[]): ValidationResult {
    if (activities.length <= 1) return { valid: true }

    const sorted = [...activities].sort(
        (a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)
    )

    // Check for same-time conflicts
    for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i]
        const next = sorted[i + 1]
        if (timeToMinutes(current.time) === timeToMinutes(next.time)) {
            return {
                valid: false,
                conflict: {
                    activityA: current,
                    activityB: next,
                    reason: `"${current.placeName}" and "${next.placeName}" are both scheduled at ${current.time}`,
                },
            }
        }
    }

    // Check original order matches sorted order
    for (let i = 0; i < activities.length; i++) {
        if (activities[i].id !== sorted[i].id) {
            const outOfOrder = activities[i]
            const shouldBeBefore = sorted[i]
            return {
                valid: false,
                conflict: {
                    activityA: outOfOrder,
                    activityB: shouldBeBefore,
                    reason: `"${outOfOrder.placeName}" at ${outOfOrder.time} is placed after "${shouldBeBefore.placeName}" at ${shouldBeBefore.time}`,
                },
            }
        }
    }

    return { valid: true }
}
