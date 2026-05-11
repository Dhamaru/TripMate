import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'

declare global {
    namespace Express {
        interface Request { requestId: string }
    }
}

export const requestIdMiddleware = (
    req: Request, res: Response, next: NextFunction
) => {
    req.requestId = crypto.randomUUID()
    res.setHeader('X-Request-ID', req.requestId)
    next()
}
