export type TripStatus = 'upcoming' | 'ongoing' | 'past'

export function getTripStatus(trip: { startDate: string; endDate: string }): TripStatus {
    const now = new Date()
    const start = new Date(trip.startDate)
    const end = new Date(trip.endDate)
    if (now < start) return 'upcoming'
    if (now > end) return 'past'
    return 'ongoing'
}

export function getTripDuration(trip: { startDate: string; endDate: string }): number {
    return Math.ceil(
        (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime())
        / (1000 * 60 * 60 * 24)
    )
}

export function formatTripDateRange(
    trip: { startDate: string; endDate: string }
): string {
    const start = new Date(trip.startDate)
    const end = new Date(trip.endDate)
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    return `${start.toLocaleDateString('en-US', opts)} — ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}
