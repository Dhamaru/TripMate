// Task 7 — Main overlap chat panel (Zustand-connected)
import { useEffect, useRef } from 'react'
import { useAgentStore, useUiStore } from '../../store'
import { ChatHeader } from './ChatHeader'
import { ChatMessageList } from './ChatMessageList'
import { SuggestedActions } from './SuggestedActions'
import { ChatInput } from './ChatInput'

export function AgentOverlayPanel() {
    const { isChatOpen, toggleChat, setContext } = useAgentStore()
    const { currentPage } = useUiStore()
    const panelRef = useRef<HTMLDivElement>(null)

    // Sync currentPage into agent context
    useEffect(() => {
        setContext({ currentPage })
    }, [currentPage, setContext])

    // Keyboard shortcut: Cmd/Ctrl + K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                toggleChat()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [toggleChat])

    if (!isChatOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-black/60 md:hidden"
                onClick={toggleChat}
                aria-hidden="true"
            />
            <div
                ref={panelRef}
                className="fixed inset-0 z-50 flex flex-col md:inset-auto md:right-0 md:top-0 md:h-full md:w-[420px] lg:w-[460px] md:shadow-2xl border-l border-border bg-card"
                role="dialog"
                aria-label="Atlas AI travel assistant"
                aria-modal="true"
            >
                <ChatHeader onClose={toggleChat} />
                <ChatMessageList />
                <SuggestedActions />
                <ChatInput />
            </div>
        </>
    )
}
