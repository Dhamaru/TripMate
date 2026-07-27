import type { TripStatus } from '../../utils/tripStatus'

const CONFIG = {
    upcoming: { label: 'Upcoming', className: 'bg-[#1D4E89]/15 text-[#4F82C4] border-[#1D4E89]/50' },
    ongoing: { label: 'Ongoing', className: 'bg-[#3D9467]/15 text-[#3D9467] border-[#3D9467]/50 animate-pulse' },
    past: { label: 'Past', className: 'bg-white/5 text-gray-500 border-white/10' },
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
