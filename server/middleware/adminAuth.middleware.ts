import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { UnauthorizedError } from "../errors";

/**
 * Service-to-service auth for the automated feedback-triage routine — checks
 * a static secret header instead of a logged-in user, so the scheduled cloud
 * agent never needs an account password. Fails closed if ADMIN_SECRET isn't
 * configured, rather than silently allowing every request through.
 */
export const requireAdminSecret = (req: Request, res: Response, next: NextFunction) => {
    if (!config.ADMIN_SECRET) {
        return next(new UnauthorizedError("Admin endpoints are not configured"));
    }
    const provided = req.headers["x-admin-secret"];
    if (provided !== config.ADMIN_SECRET) {
        return next(new UnauthorizedError("Invalid admin secret"));
    }
    next();
};
