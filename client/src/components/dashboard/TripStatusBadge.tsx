import type { TripStatus } from '../../utils/tripStatus'

const CONFIG = {
    upcoming: { label: 'Upcoming', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    ongoing: { label: 'Ongoing', className: 'bg-green-500/10 text-green-400 border-green-500/20 animate-pulse' },
    past: { label: 'Past', className: 'bg-white/5 text-gray-500 border-white/10' },
} as const

export function TripStatusBadge({ status }: { status: TripStatus }) {
    const c = CONFIG[status]
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${c.className}`}
            aria-label={`Trip status: ${c.label}`}>
            {c.label}
        </span>
    )
}
