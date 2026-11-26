import { Request } from 'express'

declare global {
    namespace Express {
        interface User {
            _id: string;
            id: string;
            email?: string;
        }
        interface Request {
            requestId: string;
        }
    }
}
