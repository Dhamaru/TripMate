import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { UnauthorizedError } from '../errors'

export const requireAuth = (
    req: Request, res: Response, next: NextFunction
) => {
    try {
        const token = req.cookies?.token
            ?? req.headers.authorization?.replace('Bearer ', '')
        if (!token) throw new UnauthorizedError('Authentication required')
        const decoded = jwt.verify(token, config.JWT_SECRET) as any;
        req.user = decoded
        next()
    } catch {
        next(new UnauthorizedError('Invalid or expired token'))
    }
}

export const optionalAuth = (
    req: Request, res: Response, next: NextFunction
) => {
    try {
        const token = req.cookies?.token
            ?? req.headers.authorization?.replace('Bearer ', '')
        if (token) {
            const decoded = jwt.verify(token, config.JWT_SECRET) as any;
            req.user = decoded
        }
    } catch { /* ignore */ }
    next()
}
