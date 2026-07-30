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

    // streamMessage adds the assistant's placeholder message (empty content,
    // isStreaming: true) up front, before any tokens arrive — so the "last
    // message is from the user" check below stops matching the instant the
    // stream starts, and the typing indicator disappears in favor of a blank
    // bubble for the whole time-to-first-token latency (which can be 20-30s+
    // when the backend is falling back between providers).
    const lastMessage = messages[messages.length - 1]
    const showTyping =
        isLoading && (
            messages.length === 0 ||
            lastMessage.role === 'user' ||
            (lastMessage.isStreaming === true && lastMessage.content === '')
        )

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
                msg.isStreaming && msg.content === '' ? null :
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-[#1D4E89] flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold text-white">A</div>
                    )}
                    <div
                        className={
                            msg.role === 'user'
                                ? "max-w-[78%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-[#163F73] text-white text-sm leading-relaxed shadow-sm"
                                : "max-w-[78%] px-4 py-3 rounded-2xl rounded-bl-sm bg-muted/80 border border-border/50 text-foreground text-sm leading-relaxed"
                        }
                        aria-label={`${msg.role === 'user' ? 'You' : 'Atlas'}: ${msg.content}`}
                    >
                        <div className="relative break-words whitespace-pre-wrap">
                            {msg.content}
                            {msg.isStreaming && (
                                <span className="inline-block w-1.5 h-4 bg-current opacity-60 ml-1 align-middle animate-pulse" aria-hidden="true" />
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
                </div>
            ))}
            {showTyping && <TypingIndicator />}
            <div ref={bottomRef} aria-hidden="true" />
        </div>
    )
}
