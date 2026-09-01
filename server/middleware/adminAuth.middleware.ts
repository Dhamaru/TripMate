import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
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
  // Plain !== is a timing side-channel on a secret-comparison path —
  // string equality short-circuits on the first mismatched byte, so
  // response time leaks how many leading characters an attacker got
  // right. timingSafeEqual needs equal-length buffers, so check length
  // first (a length mismatch is safe to fail fast on, it leaks nothing
  // an attacker doesn't already know from trying different lengths).
  if (
    typeof provided !== "string" ||
    provided.length !== config.ADMIN_SECRET.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(config.ADMIN_SECRET))
  ) {
    return next(new UnauthorizedError("Invalid admin secret"));
  }
  next();
};
