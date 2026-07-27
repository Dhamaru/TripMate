// Task 8 — Atlas day-level optimization button

import { useAgentStore } from '../../store'
import type { Activity } from '../../types/api.types'

interface Props {
    dayIndex: number
    destination: string
    activities: Activity[]
    tripId: string
}

export function AtlasDayButton({ dayIndex, destination, activities, tripId }: Props) {
    const { toggleChat, setContext, sendMessage } = useAgentStore()

    const handleClick = () => {
        setContext({ currentTripId: tripId, currentPage: 'trip-detail' })
        toggleChat()
        const activityList = activities.map(a => a.placeName).join(', ')
        void sendMessage(`Help me optimize Day ${dayIndex + 1} in ${destination}. Current activities: ${activityList}`)
    }

    return (
        <button
            className="w-[calc(100%-2rem)] mx-4 mb-4 py-2 px-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-[#B3261E]/50 hover:text-[#B3261E] transition-colors flex items-center justify-center gap-2"
            onClick={handleClick}
            aria-label={`Ask Atlas to help optimize day ${dayIndex + 1}`}
        >
            🌍 Ask Atlas to Optimize Day
        </button>
    )
}
