// Task 8 — Atlas floating trigger button
import { useAgentStore } from '../../store'

export function AtlasTriggerButton() {
    const toggleChat = useAgentStore(s => s.toggleChat)
    return (
        <button
            className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center hover:brightness-110"
            onClick={toggleChat}
            aria-label="Open Atlas AI assistant (Ctrl+K)"
            title="Open Atlas (Ctrl+K)"
            style={{ width: 52, height: 52 }}
        >
            <svg width="52" height="52" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="atlas-trigger-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#1E3A8A" />
                        <stop offset="100%" stopColor="#F59E0B" />
                    </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="50" fill="url(#atlas-trigger-gradient)" />
                <path d="M30 35 L70 50 L30 65 L35 50 Z" fill="white" />
            </svg>
        </button>
    )
}
