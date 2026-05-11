// Task 3 — Axios API client with typed error handling

import axios from 'axios'
import type { AxiosError } from 'axios'
import { env } from '../../config/env'

export interface ApiError {
    message: string
    code: string
    statusCode: number
    requestId?: string
}

const client = axios.create({
    baseURL: env.VITE_API_URL,
    withCredentials: true,
    timeout: 60000,
})

// Request interceptor — add X-Request-ID (auth via httpOnly cookie, set automatically by withCredentials)
client.interceptors.request.use((config) => {
    config.headers['X-Request-ID'] = crypto.randomUUID()
    return config
})

interface ErrorResponseData {
    error: string
    code: string
    requestId?: string
}

// Response interceptor — unwrap data.data, throw typed ApiError
client.interceptors.response.use(
    (response) => {
        // Unwrap the standard { success, data } envelope
        if (response.data && 'data' in response.data) {
            return response.data.data
        }
        return response.data
    },
    async (error: AxiosError<ErrorResponseData>) => {
        const status = error.response?.status ?? 500
        // Retry on 503 up to 2 times with backoff
        const cfg = error.config as (typeof error.config & { _retryCount?: number })
        if (cfg && status === 503 && (cfg._retryCount ?? 0) < 2) {
            cfg._retryCount = (cfg._retryCount ?? 0) + 1
            await new Promise(r => setTimeout(r, cfg._retryCount! * 1000))
            return client(cfg)
        }
        const apiError: ApiError = {
            message: error.response?.data?.error ?? 'An unexpected error occurred',
            code: error.response?.data?.code ?? 'UNKNOWN_ERROR',
            statusCode: status,
            requestId: error.response?.data?.requestId,
        }
        return Promise.reject(apiError)
    }
)

export default client
