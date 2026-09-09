import { Request } from "express";

declare global {
  namespace Express {
    interface User {
      _id: string;
      id: string;
      email?: string;
      // Signed into the JWT by issueSession's `extra` param for guest
      // sessions (auth.controller.ts's guestSignin) and spread onto
      // req.user by auth.middleware.ts — real for guest requests,
      // undefined otherwise. Used by the guest-aware rate-limit key
      // generator (rateLimit.middleware.ts).
      isGuest?: boolean;
    }
    interface Request {
      requestId: string;
    }
  }
}
