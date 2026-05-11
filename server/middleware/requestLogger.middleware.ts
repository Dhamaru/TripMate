import { Request, Response, NextFunction } from 'express'
import logger from '../logger'

export const requestLoggerMiddleware = (
    req: Request, res: Response, next: NextFunction
) => {
    const start = Date.now()
    res.on('finish', () => {
        logger.info('API_REQUEST', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: Date.now() - start,
            requestId: req.requestId ?? 'unknown',
        })
    })
    next()
}
