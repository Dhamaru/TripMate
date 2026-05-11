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
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" aria-hidden="true">🔍</span>
                    <input
                        type="text"
                        value={filters.search}
                        onChange={e => set({ search: e.target.value })}
                        placeholder="Search destinations..."
                        className="w-full bg-muted border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#F59E0B] transition-colors"
                        aria-label="Search trips by destination"
                    />
                    {filters.search && (
                        <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => set({ search: '' })} aria-label="Clear search">✕</button>
                    )}
                </div>
                <button
                    className={`px-4 py-2.5 rounded-xl text-sm border transition-colors ${open ? 'bg-muted border-border text-foreground' : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setOpen(p => !p)}
                    aria-expanded={open}
                    aria-label="Toggle filters"
                >
                    ⚙ Filters
                </button>
                <select
                    value={filters.sort}
                    onChange={e => set({ sort: e.target.value as SortOption })}
                    className="px-3 py-2.5 rounded-xl text-sm bg-muted border border-border text-muted-foreground outline-none cursor-pointer hover:text-foreground transition-colors"
                    aria-label="Sort trips"
                >
                    {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
            </div>

            {open && (
                <div className="bg-muted rounded-xl p-4 space-y-4 border border-border">
                    <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Status</p>
                        <div className="flex flex-wrap gap-2">
                            {STATUSES.map(s => (
                                <button key={s}
                                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors capitalize ${filters.status === s ? 'bg-[#F59E0B] border-[#F59E0B] text-white' : 'bg-transparent border-border text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => set({ status: s as FilterState['status'] })}
                                    aria-pressed={filters.status === s}
                                    aria-label={`Filter status: ${s}`}>
                                    {s === 'all' ? 'All' : s}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Style</p>
                        <div className="flex flex-wrap gap-2">
                            {STYLES.map(s => (
                                <button key={s}
                                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${filters.travelStyle === s ? 'bg-[#F59E0B] border-[#F59E0B] text-white' : 'bg-transparent border-border text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => set({ travelStyle: s })}
                                    aria-pressed={filters.travelStyle === s}
                                    aria-label={`Filter style: ${s}`}>
                                    {s === 'all' ? 'All styles' : s}
                                </button>
                            ))}
                        </div>
                    </div>
                    {(filters.status !== 'all' || filters.travelStyle !== 'all') && (
                        <button className="text-xs text-muted-foreground hover:text-foreground underline transition-colors" onClick={() => set({ status: 'all', travelStyle: 'all' })} aria-label="Clear all filters">
                            Clear filters
                        </button>
                    )}
                </div>
            )}
            <p className="text-xs text-muted-foreground" aria-live="polite">
                {tripCount} {tripCount === 1 ? 'trip' : 'trips'}
            </p>
        </div>
    )
}
