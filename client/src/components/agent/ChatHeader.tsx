// Task 7 — Chat header with clear and close actions
import { useAgentStore } from '../../store'

interface Props { onClose: () => void }

export function ChatHeader({ onClose }: Props) {
    const clearConversation = useAgentStore(s => s.clearConversation)
    return (
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/20">
            <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm" aria-hidden="true">🌍</span>
                <div>
                    <h2 className="text-white text-sm font-semibold leading-tight">Atlas AI</h2>
                    <span className="text-xs text-[#06e0f9]">Your AI travel expert</span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded transition-colors"
                    onClick={clearConversation}
                    aria-label="Clear conversation"
                >
                    Clear
                </button>
                <button
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                    onClick={onClose}
                    aria-label="Close Atlas chat panel"
                >
                    ✕
                </button>
            </div>
        </div>
    )
}
