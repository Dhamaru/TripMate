import { config } from "./config";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import MemoryStore from "memorystore";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { getBackendBaseUrl } from "./urls";

import crypto from "crypto";
import { sendPasswordResetEmail } from "./email";

export async function hashPassword(password: string) {
  return await bcrypt.hash(password, 10);
}

export async function comparePasswords(supplied: string, stored: string) {
  return await bcrypt.compare(supplied, stored);
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const MemoryStoreSession = MemoryStore(session);
  const sessionStore = new MemoryStoreSession({ checkPeriod: 86400000 });
  return session({
    secret: config.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Extract JWT from httpOnly cookie first, then fall back to Bearer header
  const cookieOrBearerExtractor = (req: any) => {
    if (req?.cookies?.token) return req.cookies.token;
    return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  };

  const jwtOptions = {
    jwtFromRequest: cookieOrBearerExtractor,
    secretOrKey: config.JWT_SECRET,
  };

  passport.use(
    new JwtStrategy(jwtOptions, async (jwtPayload: any, done: any) => {
      try {
        const user = await storage.getUser(jwtPayload.sub);
        if (user) {
          return done(null, {
            _id: user.id, // Mongoose id is the string _id
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
            claims: jwtPayload,
          });
        } else {
          return done(null, false);
        }
      } catch (error) {
        return done(error, false);
      }
    }),
  );

  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.GOOGLE_CLIENT_ID,
          clientSecret: config.GOOGLE_CLIENT_SECRET,
          callbackURL: `${config.FRONTEND_URL || "https://tripmate-ylt6.onrender.com"}/api/v1/auth/google/callback`,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const rawEmail = profile.emails?.[0]?.value;
            if (!rawEmail) return done(new Error("No email provided by Google"));
            const email = rawEmail.toLowerCase();

            // Was storage.getUser(email) — that function looks up by Mongo
            // _id, not email. A password-signup account gets a random nanoid
            // _id (not its email), so this lookup always missed for anyone
            // who signed up normally first, fell through to the upsert
            // below, and collided with the unique email index — live-
            // reproduced as a real E11000 duplicate-key error, surfacing to
            // the user as a generic, permanent "Continue with Google" login
            // failure with zero explanation. getUserByEmail is the function
            // that actually exists for this (LocalStrategy already uses it
            // a few lines down).
            let user = await storage.getUserByEmail(email);
            if (!user) {
              user = await storage.upsertUser({
                _id: email,
                email,
                firstName: profile.name?.givenName,
                lastName: profile.name?.familyName,
                profileImageUrl: profile.photos?.[0]?.value,
                googleConnected: true,
                googleId: profile.id,
              });
            } else if (user.password && !user.googleConnected) {
              // Fixing the lookup above made this branch reachable for the
              // first time — and reaching it silently would have been a
              // real account-takeover path (caught by a security-review
              // pass on this exact diff): anyone can register any email
              // with a password here today, since signup has no email
              // verification. Left as-is, this would let an attacker
              // pre-register a victim's email, then have the victim's own
              // real "Continue with Google" sign-in get silently linked
              // onto the attacker's pre-made account and session — the
              // attacker's original password still works and now has
              // standing access to everything the victim does afterward.
              // The codebase already refuses the mirror-image case for
              // exactly this reason (signup won't let a caller set a
              // password on an existing Google account without emailed
              // proof of inbox ownership, see the comment in
              // auth.controller.ts's signup) — apply the same refusal
              // here instead of silently linking. A real "connect Google
              // to my account" flow belongs behind an authenticated
              // session (Profile settings), not an anonymous OAuth
              // callback matched on email alone.
              return done(null, false, {
                message:
                  "An account with this email already has a password set. Sign in with your password instead.",
              });
            } else {
              const updates: Record<string, any> = { googleConnected: true, googleId: profile.id };
              if (!user.profileImageUrl && profile.photos?.[0]?.value) {
                updates.profileImageUrl = profile.photos[0].value;
              }
              const updated = await storage.updateUser(user.id, updates);
              if (updated) user = updated;
            }
            return done(null, user as any);
          } catch (error) {
            return done(error);
          }
        },
      ),
    );
  }

  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const localUser = await storage.getUserByEmail(email);

          if (!localUser) {
            return done(null, false, { message: "User not found. Please register first." });
          }

          if (
            !localUser ||
            !localUser.password ||
            !(await bcrypt.compare(password, localUser.password))
          ) {
            return done(null, false, { message: "Invalid credentials" });
          }

          return done(null, {
            _id: localUser.id,
            id: localUser.id,
            email: localUser.email!,
            firstName: localUser.firstName,
            lastName: localUser.lastName,
            profileImageUrl: localUser.profileImageUrl,
            claims: {
              sub: localUser.id,
              email: localUser.email!,
              first_name: localUser.firstName,
              last_name: localUser.lastName,
              profile_image_url: localUser.profileImageUrl,
            },
          } as any);
        } catch (error) {
          console.error("Authentication error:", error);
          return done(error);
        }
      },
    ),
  );

  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  // OAuth routes have been moved to server/routes.ts
  // to ensure consistent session creation (Access+Refresh Tokens)
  // using the shared session store logic.

  // Routes for forgot/reset password have been moved to server/routes.ts
  // to share access to memoryUsers/storage logic correctly.
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};

export const isJwtAuthenticated: RequestHandler = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err: any, user: any) => {
    if (err) {
      return res.status(500).json({ message: "Authentication error" });
    }
    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }
    req.user = user;
    return next();
  })(req, res, next);
};
