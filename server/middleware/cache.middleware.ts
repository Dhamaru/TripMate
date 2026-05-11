// Cache middleware for Express GET routes — intercepts res.json to store/serve cached responses
import { Request, Response, NextFunction } from 'express'
import { cacheService } from '../cache'
import logger from '../logger'

export const cacheMiddleware = (
    keyFn: (req: Request) => string,
    ttlSeconds: number
) => (req: Request, res: Response, next: NextFunction): void => {
    const key = keyFn(req)
    const cached = cacheService.get<unknown>(key)
    if (cached) {
        logger.debug(`[CACHE HIT] Route: ${req.path}`)
        res.json({ success: true, data: cached, cached: true })
        return
    }
    // Intercept res.json to cache the response on the way out
    const originalJson = res.json.bind(res) as typeof res.json
    res.json = (body: unknown) => {
        if (body && typeof body === 'object' && (body as Record<string, unknown>).success && (body as Record<string, unknown>).data) {
            cacheService.set(key, (body as Record<string, unknown>).data, ttlSeconds)
        }
        return originalJson(body)
    }
    next()
}
