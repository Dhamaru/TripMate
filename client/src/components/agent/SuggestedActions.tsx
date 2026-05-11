// Task 7 — Suggested actions chip strip
import { useLocation } from 'wouter'
import { useAgentStore } from '../../store'
import type { SuggestedAction } from '../../types/api.types'

export function SuggestedActions() {
    const { suggestedActions, sendMessage, toggleChat } = useAgentStore()
    const [, navigate] = useLocation()

    if (suggestedActions.length === 0) return null

    const handleAction = (action: SuggestedAction) => {
        if (action.action === 'navigate' && typeof action.payload === 'string') {
            navigate(action.payload)
            toggleChat()
        } else {
            void sendMessage(action.label)
        }
        useAgentStore.setState({ suggestedActions: [] })
    }

    return (
        <div className="suggested-actions" aria-label="Suggested actions">
            {suggestedActions.map((action, i) => (
                <button
                    key={i}
                    className="suggested-actions__chip"
                    onClick={() => handleAction(action)}
                    aria-label={`Suggested: ${action.label}`}
                >
                    {action.label}
                </button>
            ))}
        </div>
    )
}
