import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config";
import { UnauthorizedError } from "../errors";
import rateLimit from "express-rate-limit";

/**
 * Service-to-service auth for the automated feedback-triage routine — checks
 * a static secret header instead of a logged-in user, so the scheduled cloud
 * agent never needs an account password. Fails closed if ADMIN_SECRET isn't
 * configured, rather than silently allowing every request through.
 */
// Wrong guesses only; the triage routine's real calls never count.
const adminGuessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === "test" ? 1000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, error: "Too many attempts" }),
});

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest();

const checkAdminSecret = (req: Request, res: Response, next: NextFunction) => {
  if (!config.ADMIN_SECRET) {
    return next(new UnauthorizedError("Admin endpoints are not configured"));
  }
  const provided = req.headers["x-admin-secret"];
  // Compare fixed-length digests: constant time, and no length check that
  // threw (500) on a same-length header with multi-byte characters.
  if (
    typeof provided !== "string" ||
    !crypto.timingSafeEqual(sha256(provided), sha256(config.ADMIN_SECRET))
  ) {
    return next(new UnauthorizedError("Invalid admin secret"));
  }
  next();
};

export const requireAdminSecret = (req: Request, res: Response, next: NextFunction) =>
  adminGuessLimiter(req, res, (err?: unknown) =>
    err ? next(err) : checkAdminSecret(req, res, next),
  );
