// Task 8 — Atlas floating trigger button
import { useAgentStore } from '../../store'

export function AtlasTriggerButton() {
    const toggleChat = useAgentStore(s => s.toggleChat)
    return (
        <button
            className="fixed bottom-6 right-6 z-50 w-13 h-13 bg-[#ff385c] hover:bg-[#e00b41] text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-xl"
            onClick={toggleChat}
            aria-label="Open Atlas AI assistant (Ctrl+K)"
            title="Open Atlas (Ctrl+K)"
            style={{ width: 52, height: 52 }}
        >
            🌍
        </button>
    )
}
