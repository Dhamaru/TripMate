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

        es.onmessage = (e: MessageEvent<string>) => {
            const parsed = JSON.parse(e.data) as SSEMessage
            if (parsed.type === 'token' && parsed.content) onToken(parsed.content)
            if (parsed.type === 'tool' && parsed.tool) onTool(parsed.tool)
            if (parsed.type === 'done') {
                onDone({
                    conversationId: parsed.conversationId ?? '',
                    toolsUsed: parsed.toolsUsed ?? [],
                    structuredData: parsed.structuredData,
                })
                es.close()
            }
            if (parsed.type === 'error') {
                onError(parsed.error ?? 'Stream error')
                es.close()
            }
        }
        es.onerror = () => {
            onError('Connection lost')
            es.close()
        }
        return () => es.close()
    },

    getConversation: (conversationId: string) =>
        client.get(`/api/v1/agent/history/${conversationId}`),

    clearConversation: (tripId: string) =>
        client.delete(`/api/v1/agent/history/${tripId}`),
}
