// Task 7 — Chat message list with auto-scroll
import { useEffect, useRef } from 'react'
import { useAgentStore } from '../../store'
import { ToolCallBadge } from './ToolCallBadge'
import { TypingIndicator } from './TypingIndicator'

export function ChatMessageList() {
    const { messages, isLoading } = useAgentStore()
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isLoading])

    const showTyping =
        isLoading && (messages.length === 0 || messages[messages.length - 1].role === 'user')

    return (
        <div
            className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
        >
            {messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    <p>Ask Atlas anything about your trip</p>
                </div>
            )}
            {messages.map((msg) => (
                <div
                    key={msg.id}
                    className={
                        msg.role === 'user'
                            ? "ml-auto max-w-[80%] px-4 py-2 rounded-2xl rounded-br-sm bg-[#F59E0B] text-white text-sm"
                            : "mr-auto max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-sm bg-muted text-foreground text-sm"
                    }
                    aria-label={`${msg.role === 'user' ? 'You' : 'Atlas'}: ${msg.content}`}
                >
                    <div className="relative break-words">
                        {msg.content}
                        {msg.isStreaming && (
                            <span className="inline-block w-2 bg-current opacity-50 ml-1 animate-pulse" aria-hidden="true">▋</span>
                        )}
                    </div>
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1" aria-label="Tools used">
                            {msg.toolsUsed.map((tool, i) => (
                                <ToolCallBadge key={i} toolName={tool} />
                            ))}
                        </div>
                    )}
                </div>
            ))}
            {showTyping && <TypingIndicator />}
            <div ref={bottomRef} aria-hidden="true" />
        </div>
    )
}
