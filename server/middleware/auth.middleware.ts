import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { UnauthorizedError } from "../errors";
import { SessionModel, UserModel } from "@shared/schema";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.token ?? req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const decoded = jwt.verify(token, config.JWT_SECRET) as any;

    // Every token minted since session tracking was added carries a sid
    // tying it to a SessionModel row — check it's still live so revoking
    // a session (via /sessions/:id/revoke, signout, or a password change)
    // actually takes effect immediately instead of only affecting new
    // logins. A token with no sid predates this and is treated as revoked
    // — same one-time forced re-login as any other cookie/secret rotation.
    if (!decoded.sid) {
      return next(new UnauthorizedError("Session expired, please sign in again"));
    }
    const session = await SessionModel.findOne({ sessionId: decoded.sid })
      .select("revoked expiresAt")
      .lean();
    if (!session || session.revoked || session.expiresAt.getTime() < Date.now()) {
      return next(new UnauthorizedError("Session expired, please sign in again"));
    }

    // Populate req.user to match expected structure in controllers
    req.user = {
      ...decoded,
      _id: decoded.sub,
      id: decoded.sub,
    };

    // Guest-only activity stamp — drives the 7-day inactivity purge
    // (server/scripts/purgeGuests.ts). Real accounts don't get
    // purged, so they don't need this write on every request.
    // Fire-and-forget: never block or fail a request over it, and
    // `isGuest` is already on the JWT payload (issueSession signs it
    // in), so this needs no extra DB read first.
    if (decoded.isGuest) {
      UserModel.updateOne({ _id: decoded.sub }, { $set: { lastSeenAt: new Date() } }).catch(
        () => {},
      );
    }

    next();
  } catch (err: any) {
    console.warn(`[AuthMiddleware] Auth failure: ${err.message}`);
    next(new UnauthorizedError("Invalid or expired token"));
  }
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.token ?? req.headers.authorization?.replace("Bearer ", "");

    if (token) {
      const decoded = jwt.verify(token, config.JWT_SECRET) as any;
      // Same revocation check as requireAuth — without it, a revoked
      // session (via /sessions/:id/revoke, signout, or a password
      // change) kept being treated as authenticated on every route
      // mounted with optionalAuth instead of requireAuth.
      const session = decoded.sid
        ? await SessionModel.findOne({ sessionId: decoded.sid }).select("revoked expiresAt").lean()
        : null;
      if (session && !session.revoked && session.expiresAt.getTime() > Date.now()) {
        req.user = {
          ...decoded,
          _id: decoded.sub,
          id: decoded.sub,
        };
      }
    }
  } catch {
    /* ignore — optionalAuth never blocks the request */
  }
  next();
};
