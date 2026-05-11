import { ZodSchema } from 'zod'
import { Request, Response, NextFunction } from 'express'

export const validate = (schema: ZodSchema) =>
    (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body)
        if (!result.success) {
            const errors = result.error.errors.reduce((acc, err) => {
                acc[err.path.join('.')] = err.message
                return acc
            }, {} as Record<string, string>)
            return res.status(400).json({
                success: false, code: 'VALIDATION_ERROR', errors
            })
        }
        req.body = result.data
        next()
    }
