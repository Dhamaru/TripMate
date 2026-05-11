// Task 8 — Atlas floating trigger button
import { useAgentStore } from '../../store'

export function AtlasTriggerButton() {
    const toggleChat = useAgentStore(s => s.toggleChat)
    return (
        <button
            className="atlas-trigger-btn"
            onClick={toggleChat}
            aria-label="Open Atlas AI assistant (Ctrl+K)"
            title="Open Atlas (Ctrl+K)"
        >
            🌍
        </button>
    )
}
