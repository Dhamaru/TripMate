// Task 7 — Chat input with auto-resize and char counter
import { useState, useRef, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { useAgentStore } from '../../store'

export function ChatInput() {
    const [text, setText] = useState('')
    const { isLoading, streamMessage } = useAgentStore()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const MAX_CHARS = 2000
    const COUNTER_THRESHOLD = 1800

    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }, [text])

    const handleSubmit = async () => {
        const trimmed = text.trim()
        if (!trimmed || isLoading) return
        setText('')
        await streamMessage(trimmed)
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void handleSubmit()
        }
    }

    return (
        <div className="flex items-end gap-2 p-3 border-t border-border bg-card">
            <textarea
                ref={textareaRef}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground max-h-32 py-2"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder="Ask Atlas anything..."
                rows={1}
                aria-label="Message to Atlas"
                aria-disabled={isLoading}
            />
            {text.length >= COUNTER_THRESHOLD && (
                <span className="absolute right-14 bottom-14 text-[10px] text-muted-foreground" aria-label={`${MAX_CHARS - text.length} characters remaining`}>
                    {MAX_CHARS - text.length}
                </span>
            )}
            <button
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[#B3261E] text-white hover:bg-[#8C1D17] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 mb-1 transition-colors"
                onClick={() => void handleSubmit()}
                disabled={isLoading || !text.trim()}
                aria-label="Send message"
            >
                {isLoading ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true" />
                ) : (
                    <span className="text-sm font-bold" aria-hidden="true">↑</span>
                )}
            </button>
        </div>
    )
}
