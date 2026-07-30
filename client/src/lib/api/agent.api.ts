import client from './client'
import type { AgentResponse, AgentChatRequest } from '../../types/api.types'
import { env } from '../../config/env'

interface StreamDonePayload {
    conversationId: string
    toolsUsed: string[]
    structuredData?: unknown
}

interface SSEMessage {
    type: 'token' | 'tool' | 'done' | 'error'
    content?: string
    tool?: string
    conversationId?: string
    toolsUsed?: string[]
    structuredData?: unknown
    error?: string
}

export const agentApi = {
    chat: (data: AgentChatRequest) =>
        client.post<AgentResponse, AgentResponse>('/api/v1/agent/chat', data),

    stream: (
        data: AgentChatRequest,
        onToken: (token: string) => void,
        onTool: (tool: string) => void,
        onDone: (meta: StreamDonePayload) => void,
        onError: (error: string) => void,
    ): (() => void) => {
        const params = new URLSearchParams({
            message: data.message,
            ...(data.conversationId && { conversationId: data.conversationId }),
            ...(data.context?.currentTripId && { currentTripId: data.context.currentTripId }),
            ...(data.context?.currentPage && { currentPage: data.context.currentPage }),
        })
        const url = `${env.VITE_API_URL}/api/v1/agent/chat/stream?${params.toString()}`
        const es = new EventSource(url, { withCredentials: true })

        // A stalled connection (accepted but never sends a byte) doesn't
        // trigger EventSource's onerror — that only fires on a hard close.
        // Without a watchdog, a hung backend request leaves the UI's
        // isLoading stuck true forever. Reset this on every event received;
        // fire once if the gap since the last event (or connection open)
        // exceeds STALL_TIMEOUT_MS. Must comfortably exceed the server's
        // per-model timeout (25s) plus room for a fallback attempt, or this
        // fires before the backend's own model-fallback chain gets a chance.
        const STALL_TIMEOUT_MS = 45_000
        let stallTimer: ReturnType<typeof setTimeout>
        let settled = false
        const resetStallTimer = () => {
            clearTimeout(stallTimer)
            stallTimer = setTimeout(() => {
                if (settled) return
                settled = true
                onError('Response timed out')
                es.close()
            }, STALL_TIMEOUT_MS)
        }
        resetStallTimer()

        es.onmessage = (e: MessageEvent<string>) => {
            resetStallTimer()
            const parsed = JSON.parse(e.data) as SSEMessage
            if (parsed.type === 'token' && parsed.content) onToken(parsed.content)
            if (parsed.type === 'tool' && parsed.tool) onTool(parsed.tool)
            if (parsed.type === 'done') {
                settled = true
                clearTimeout(stallTimer)
                onDone({
                    conversationId: parsed.conversationId ?? '',
                    toolsUsed: parsed.toolsUsed ?? [],
                    structuredData: parsed.structuredData,
                })
                es.close()
            }
            if (parsed.type === 'error') {
                settled = true
                clearTimeout(stallTimer)
                onError(parsed.error ?? 'Stream error')
                es.close()
            }
        }
        es.onerror = () => {
            if (settled) return
            settled = true
            clearTimeout(stallTimer)
            onError('Connection lost')
            es.close()
        }
        return () => {
            clearTimeout(stallTimer)
            es.close()
        }
    },

    getConversation: (conversationId: string) =>
        client.get(`/api/v1/agent/history/${conversationId}`),

    clearConversation: (tripId: string) =>
        client.delete(`/api/v1/agent/history/${tripId}`),
}
