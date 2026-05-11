import { useState } from 'react'
import type { TripStatus } from '../../utils/tripStatus'

export type SortOption = 'date-desc' | 'date-asc' | 'budget-desc' | 'duration-desc'
export interface FilterState {
    search: string
    travelStyle: string
    status: TripStatus | 'all'
    sort: SortOption
}

interface Props {
    filters: FilterState
    onChange: (f: FilterState) => void
    tripCount: number
}

const STYLES = ['all', 'Luxury', 'Adventure', 'Budget', 'Relaxed', 'Cultural', 'Family']
const STATUSES = ['all', 'upcoming', 'ongoing', 'past'] as const
const SORTS: { value: SortOption; label: string }[] = [
    { value: 'date-desc', label: 'Newest' },
    { value: 'date-asc', label: 'Oldest' },
    { value: 'budget-desc', label: 'Budget ↓' },
    { value: 'duration-desc', label: 'Longest' },
]

export function DashboardFilters({ filters, onChange, tripCount }: Props) {
    const [open, setOpen] = useState(false)
    const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"
                        aria-hidden="true">🔍</span>
                    <input
                        type="text"
                        value={filters.search}
                        onChange={e => set({ search: e.target.value })}
                        placeholder="Search destinations..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl
                       pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600
                       outline-none focus:border-white/20 transition-colors"
                        aria-label="Search trips by destination"
                    />
                    {filters.search && (
                        <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500
                               hover:text-gray-300 transition-colors"
                            onClick={() => set({ search: '' })}
                            aria-label="Clear search">✕</button>
                    )}
                </div>
                <button
                    className={`px-4 py-2.5 rounded-xl text-sm border transition-colors
                     ${open ? 'bg-white/10 border-white/20 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
                    onClick={() => setOpen(p => !p)}
                    aria-expanded={open}
                    aria-label="Toggle filters">
                    ⚙ Filters
                </button>
                <select
                    value={filters.sort}
                    onChange={e => set({ sort: e.target.value as SortOption })}
                    className="px-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10
                     text-gray-400 outline-none cursor-pointer hover:text-white transition-colors"
                    aria-label="Sort trips">
                    {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
            </div>

            {open && (
                <div className="bg-white/5 rounded-xl p-4 space-y-4 border border-white/10">
                    <div>
                        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Status</p>
                        <div className="flex flex-wrap gap-2">
                            {STATUSES.map(s => (
                                <button key={s}
                                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors capitalize
                             ${filters.status === s
                                            ? 'bg-white/15 border-white/20 text-white'
                                            : 'bg-transparent border-white/10 text-gray-500 hover:text-gray-300'}`}
                                    onClick={() => set({ status: s as FilterState['status'] })}
                                    aria-pressed={filters.status === s}
                                    aria-label={`Filter status: ${s}`}>
                                    {s === 'all' ? 'All' : s}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Style</p>
                        <div className="flex flex-wrap gap-2">
                            {STYLES.map(s => (
                                <button key={s}
                                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors
                             ${filters.travelStyle === s
                                            ? 'bg-white/15 border-white/20 text-white'
                                            : 'bg-transparent border-white/10 text-gray-500 hover:text-gray-300'}`}
                                    onClick={() => set({ travelStyle: s })}
                                    aria-pressed={filters.travelStyle === s}
                                    aria-label={`Filter style: ${s}`}>
                                    {s === 'all' ? 'All styles' : s}
                                </button>
                            ))}
                        </div>
                    </div>
                    {(filters.status !== 'all' || filters.travelStyle !== 'all') && (
                        <button className="text-xs text-gray-500 hover:text-gray-300 underline transition-colors"
                            onClick={() => set({ status: 'all', travelStyle: 'all' })}
                            aria-label="Clear all filters">
                            Clear filters
                        </button>
                    )}
                </div>
            )}
            <p className="text-xs text-gray-600" aria-live="polite">
                {tripCount} {tripCount === 1 ? 'trip' : 'trips'}
            </p>
        </div>
    )
}
