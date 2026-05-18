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

  passport.use(new JwtStrategy(jwtOptions, async (jwtPayload: any, done: any) => {
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
          claims: jwtPayload
        });
      } else {
        return done(null, false);
      }
    } catch (error) {
      return done(error, false);
    }
  }));

  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
      callbackURL: `${config.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/api/v1/auth/google/callback`,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const rawEmail = profile.emails?.[0]?.value;
        if (!rawEmail) return done(new Error("No email provided by Google"));
        const email = rawEmail.toLowerCase();

        let user = await storage.getUser(email);
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
    }));
  }

  passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  }, async (email, password, done) => {
    try {
      const localUser = await storage.getUserByEmail(email);

      if (!localUser) {
        return done(null, false, { message: 'User not found. Please register first.' });
      }

      if (!localUser || !localUser.password || !(await bcrypt.compare(password, localUser.password))) {
        return done(null, false, { message: 'Invalid credentials' });
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
        }
      } as any);
    } catch (error) {
      console.error('Authentication error:', error);
      return done(error);
    }
  }));

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
  passport.authenticate('jwt', { session: false }, (err: any, user: any) => {
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
