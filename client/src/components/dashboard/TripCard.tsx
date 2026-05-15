import { useState } from 'react'
import { useLocation } from 'wouter'
import { useTripStore } from '../../store'
import { TripStatusBadge } from './TripStatusBadge'
import { OptimizedImage } from '../ui/OptimizedImage'
import { getTripStatus, getTripDuration, formatTripDateRange } from '../../utils/tripStatus'
import type { Trip } from '../../types/api.types'

const STYLE_ICONS: Record<string, string> = {
    Luxury: '✨', Adventure: '🏔', Budget: '💰',
    Relaxed: '🌴', Cultural: '🎭', Family: '👨👩👧',
}
const MEDIUM_ICONS: Record<string, string> = {
    Flight: '✈️', Train: '🚂', RoadTrip: '🚗',
}

export function TripCard({ trip }: { trip: Trip }) {
    const [, navigate] = useLocation()
    const { deleteTrip } = useTripStore()
    const [showConfirm, setShowConfirm] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!showConfirm) {
            setShowConfirm(true)
            setTimeout(() => setShowConfirm(false), 3000)
            return
        }
        setIsDeleting(true)
        await deleteTrip(trip.id!)
    }

    return (
        <div
            className="relative group rounded-2xl overflow-hidden cursor-pointer aspect-[3/4] bg-card border border-border transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
            onClick={() => navigate(`/app/trips/${trip.id}`)}
            role="article"
            aria-label={`Trip to ${trip.destination}`}
        >
            {trip.imageUrl ? (
                <OptimizedImage
                    src={trip.imageUrl}
                    alt={trip.destination}
                    className="absolute inset-0"
                    fallback={<div className="absolute inset-0 bg-gradient-to-br from-[#1E3A8A] to-blue-900" />}
                />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#1E3A8A] to-blue-900 flex items-center justify-center text-5xl opacity-20" aria-hidden="true">🌍</div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

            <div className="absolute top-3 right-3">
                <TripStatusBadge status={getTripStatus({ startDate: new Date(trip.startDate).toISOString(), endDate: new Date(trip.endDate).toISOString() })} />
            </div>

            <button
                className={`absolute top-3 left-3 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-200 opacity-0 group-hover:opacity-100 ${showConfirm ? 'bg-red-500 text-white' : 'bg-black/40 text-white/60 hover:bg-red-500/80 hover:text-white'}`}
                onClick={handleDelete}
                disabled={isDeleting}
                aria-label={showConfirm ? 'Confirm delete trip' : `Delete trip to ${trip.destination}`}
            >
                {isDeleting ? '↻' : showConfirm ? '✓' : '🗑'}
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="text-white font-semibold text-base leading-tight mb-1 line-clamp-2">{trip.destination}</h3>
                <p className="text-white/70 text-xs mb-3">{formatTripDateRange({ startDate: new Date(trip.startDate).toISOString(), endDate: new Date(trip.endDate).toISOString() })}</p>
                <div className="flex flex-wrap gap-1.5">
                    {[
                        `${getTripDuration({ startDate: new Date(trip.startDate).toISOString(), endDate: new Date(trip.endDate).toISOString() })}d`,
                        `${STYLE_ICONS[trip.travelStyle!] ?? '🧳'} ${trip.travelStyle}`,
                        `${MEDIUM_ICONS[trip.transportMode!] ?? '🚀'} ${trip.transportMode}`,
                        `👥 ${trip.groupSize}`,
                    ].map((chip, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20">{chip}</span>
                    ))}
                </div>
            </div>
        </div>
    )
}
