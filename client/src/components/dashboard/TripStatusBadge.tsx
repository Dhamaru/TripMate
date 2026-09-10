import type { TripStatus } from '../../utils/tripStatus'

const CONFIG = {
    upcoming: { label: 'Upcoming', className: 'bg-[rgb(var(--customs-blue-deep-rgb)/15%)] text-[#4F82C4] border-[rgb(var(--customs-blue-rgb)/50%)]' },
    ongoing: { label: 'Ongoing', className: 'bg-[rgb(var(--transit-green-deep-rgb)/15%)] text-[var(--transit-green)] border-[rgb(var(--transit-green-rgb)/50%)] animate-pulse' },
    past: { label: 'Past', className: 'bg-[rgb(var(--stamp-red-deep-rgb)/15%)] text-[var(--stamp-red)] border-[rgb(var(--stamp-red-rgb)/50%)]' },
} as const

export function TripStatusBadge({ status }: { status: TripStatus }) {
    const c = CONFIG[status]
    return (
        <span className={`stamp text-[10px] ${c.className}`}
            aria-label={`Trip status: ${c.label}`}>
            {c.label}
        </span>
    )
}
