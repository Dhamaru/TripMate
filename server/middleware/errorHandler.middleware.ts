import { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors'
import logger from '../logger'
import { config } from '../config'

export const errorHandler = (
    err: Error, req: Request, res: Response, _next: NextFunction
) => {
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    const isAuthError = statusCode === 401 || statusCode === 403;

    logger.error('ERROR', {
        message: err.message,
        stack: (config.NODE_ENV !== 'production' && !isAuthError) ? err.stack : undefined,
        requestId: req.requestId,
        path: req.path,
    })

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            code: (err as any).code,
            requestId: req.requestId,
        })
    }

    // Mongoose ValidationError
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            requestId: req.requestId,
        })
    }

    // Default 500
    return res.status(500).json({
        success: false,
        error: config.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
        code: 'INTERNAL_ERROR',
        requestId: req.requestId,
    })
}
