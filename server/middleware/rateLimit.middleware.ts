import rateLimit from 'express-rate-limit'
import { config } from '../config'

const rateLimitResponse = (retryAfter: number) => ({
    success: false,
    code: 'RATE_LIMITED',
    error: 'Too many requests',
    retryAfter,
})

export const generalLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000,
    max: config.RATE_LIMIT_MAX ?? 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json(rateLimitResponse(15 * 60)),
    skip: (req) => {
        const path = req.path ?? "";
        return path.startsWith("/health")
            || path.startsWith("/liveness")
            || path.startsWith("/readiness")
            || path.startsWith("/version");
    },
})

// Proxy limiter for external API pass-through routes (weather, places)
export const apiProxyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json(rateLimitResponse(60)),
})

// Strict limiter for auth endpoints — prevents brute-force and credential stuffing
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json(rateLimitResponse(15 * 60)),
})

export const aiLimiter = rateLimit({
    windowMs: config.AI_RATE_LIMIT_WINDOW_MS ?? 60 * 1000,
    max: config.AI_RATE_LIMIT_MAX ?? 20,
    handler: (req, res) => res.status(429).json(rateLimitResponse(60)),
})

export const generationLimiter = rateLimit({
    windowMs: config.GENERATION_RATE_LIMIT_WINDOW_MS ?? 60 * 60 * 1000,
    max: config.GENERATION_RATE_LIMIT_MAX ?? 5,
    handler: (req, res) => res.status(429).json(rateLimitResponse(60 * 60)),
})
