import { create } from 'zustand'
import type { AgentMessage, SuggestedAction, AgentStructuredData } from '../types/api.types'
import { agentApi } from '../lib/api'
import { nanoid } from 'nanoid'

interface AgentContext {
    currentTripId?: string
    currentPage?: string
}

interface AgentStore {
    conversationId: string | null
    messages: AgentMessage[]
    isLoading: boolean
    error: string | null
    suggestedActions: SuggestedAction[]
    context: AgentContext
    isChatOpen: boolean
    // Closes the in-flight EventSource + clears its stall timer. agentApi.stream()
    // returns this on every call, but until now nothing captured or invoked
    // it — closing the panel mid-response left the connection and its ~45s
    // watchdog timer running invisibly in the background instead of tearing
    // down with the UI that was displaying it.
    activeStreamCleanup: (() => void) | null
    toggleChat: () => void
    setContext: (context: AgentContext) => void
    sendMessage: (text: string) => Promise<void>
    streamMessage: (text: string) => Promise<void>
    clearConversation: () => void
    handleStructuredData: (data: AgentStructuredData) => void
}

export const useAgentStore = create<AgentStore>((set, get) => ({
    conversationId: null,
    messages: [],
    isLoading: false,
    error: null,
    suggestedActions: [],
    context: {},
    isChatOpen: false,

    activeStreamCleanup: null,
    toggleChat: () => set((state) => {
        const closing = state.isChatOpen;
        const hadActiveStream = closing && !!state.activeStreamCleanup;
        if (hadActiveStream) {
            state.activeStreamCleanup!();
        }
        return {
            isChatOpen: !state.isChatOpen,
            activeStreamCleanup: closing ? null : state.activeStreamCleanup,
            // es.close() is a client-initiated close — per the EventSource
            // spec it does NOT fire onerror, so neither onDone nor onError
            // ever ran to reset these. Without this, closing mid-response
            // left isLoading/isStreaming stuck true forever: the input
            // stayed disabled and the streaming bubble stayed frozen with
            // its cursor, even after reopening the panel — required a full
            // page reload to recover.
            ...(hadActiveStream ? {
                isLoading: false,
                messages: state.messages.map(m => m.isStreaming ? { ...m, isStreaming: false } : m),
            } : {}),
        };
    }),

    setContext: (context) => set((state) => ({ context: { ...state.context, ...context } })),

    sendMessage: async (text) => {
        const userMsg: AgentMessage = {
            id: nanoid(), role: 'user', content: text, timestamp: new Date().toISOString()
        }
        set((state) => ({
            messages: [...state.messages, userMsg],
            isLoading: true,
            error: null,
            suggestedActions: [],
        }))
        try {
            const result = await agentApi.chat({
                message: text,
                conversationId: get().conversationId ?? undefined,
                context: get().context,
            })
            const assistantMsg: AgentMessage = {
                id: nanoid(),
                role: 'assistant',
                content: result.message || result.response || "I'm here to help, but I couldn't form a response. Please try again.",
                toolsUsed: result.toolsUsed,
                timestamp: new Date().toISOString()
            }
            set((state) => ({
                messages: [...state.messages, assistantMsg],
                conversationId: result.conversationId,
                suggestedActions: result.suggestedActions ?? [],
                isLoading: false,
            }))
            if (result.structuredData) get().handleStructuredData(result.structuredData as any)
        } catch (e: any) {
            const msg = e?.message || e?.error || String(e) || 'Network error';
            const errorMsg: AgentMessage = {
                id: nanoid(),
                role: 'assistant',
                content: `⚠️ Sorry, I encountered an error: ${msg}. Please try again.`,
                timestamp: new Date().toISOString()
            }
            set((state) => ({ 
                messages: [...state.messages, errorMsg],
                error: msg, 
                isLoading: false 
            }))
        }
    },

    streamMessage: async (text) => {
        const userMsg: AgentMessage = {
            id: nanoid(), role: 'user', content: text, timestamp: new Date().toISOString()
        }
        const streamingId = nanoid()
        const streamingMsg: AgentMessage = {
            id: streamingId, role: 'assistant', content: '',
            timestamp: new Date().toISOString(), isStreaming: true,
        }
        set((state) => ({
            messages: [...state.messages, userMsg, streamingMsg],
            isLoading: true, error: null, suggestedActions: [],
        }))

        return new Promise<void>((resolve) => {
            const cleanup = agentApi.stream(
                { message: text, conversationId: get().conversationId ?? undefined, context: get().context },
                (token) => {
                    set((state) => ({
                        messages: state.messages.map(m =>
                            m.id === streamingId ? { ...m, content: m.content + token } : m
                        )
                    }))
                },
                (tool) => {
                    set((state) => ({
                        messages: state.messages.map(m =>
                            m.id === streamingId
                                // Server fires onTool per invocation, not per
                                // unique tool — a turn that calls the same
                                // tool twice (e.g. two search_places calls)
                                // showed two identical badges mid-stream. The
                                // final `done` event already sends a
                                // deduplicated toolsUsed array, but only after
                                // streaming finishes, so this flickered
                                // visibly for multi-tool-call turns until then.
                                ? { ...m, toolsUsed: (m.toolsUsed ?? []).includes(tool) ? m.toolsUsed : [...(m.toolsUsed ?? []), tool] }
                                : m
                        )
                    }))
                },
                (meta) => {
                    set((state) => ({
                        messages: state.messages.map(m =>
                            m.id === streamingId ? { ...m, isStreaming: false, toolsUsed: meta.toolsUsed } : m
                        ),
                        conversationId: meta.conversationId,
                        isLoading: false,
                        activeStreamCleanup: null,
                    }))
                    if (meta.structuredData) {
                        get().handleStructuredData(meta.structuredData as AgentStructuredData)
                    }
                    resolve()
                },
                (error) => {
                    set((state) => ({
                        messages: state.messages.map(m =>
                            m.id === streamingId ? { ...m, content: `Error: ${error}`, isStreaming: false } : m
                        ),
                        isLoading: false, error,
                        activeStreamCleanup: null,
                    }))
                    resolve()
                }
            )
            set({ activeStreamCleanup: cleanup })
        })
    },

    clearConversation: () => {
        const { conversationId } = get()
        if (conversationId) {
            agentApi.clearConversation(conversationId).catch(() => { })
        }
        set({ messages: [], conversationId: null, suggestedActions: [] })
    },

    handleStructuredData: (_data: AgentStructuredData) => {
        // Structured data received from Atlas — trip store will refresh on next fetchTrips
    },
}))
