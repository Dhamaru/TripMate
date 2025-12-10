import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as AppleStrategy } from "passport-apple";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import MemoryStore from "memorystore";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storage } from "./storage";

import crypto from "crypto";
import { sendPasswordResetEmail } from "./email";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const MemoryStoreSession = MemoryStore(session);
  const sessionStore = new MemoryStoreSession({
    checkPeriod: 86400000,
  });
  return session({
    secret: process.env.SESSION_SECRET || "your-session-secret-key",
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

  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || "your-jwt-secret-key",
  };

  passport.use(new JwtStrategy(jwtOptions, async (jwtPayload: any, done: any) => {
    try {
      const user = await storage.getUser(jwtPayload.sub);
      if (user) {
        return done(null, {
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

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/api/v1/auth/google/callback`
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
          });
        } else if (!user.profileImageUrl && profile.photos?.[0]?.value) {
          // If user exists but has no profile picture, update it from Google
          // This ensures we don't overwrite a user-chosen photo, but populate it if missing
          const updated = await storage.updateUser(user.id, { profileImageUrl: profile.photos[0].value });
          if (updated) user = updated;
        }
        return done(null, user);
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
      const localUser = await storage.getUser(email);

      if (!localUser) {
        return done(null, false, { message: 'User not found. Please register first.' });
      }

      if (!localUser || !localUser.password || !(await bcrypt.compare(password, localUser.password))) {
        return done(null, false, { message: 'Invalid credentials' });
      }

      return done(null, {
        id: localUser.id,
        email: localUser.email,
        firstName: localUser.firstName,
        lastName: localUser.lastName,
        profileImageUrl: localUser.profileImageUrl,
        claims: {
          sub: localUser.id,
          email: localUser.email,
          first_name: localUser.firstName,
          last_name: localUser.lastName,
          profile_image_url: localUser.profileImageUrl,
        }
      });
    } catch (error) {
      console.error('Authentication error:', error);
      return done(error);
    }
  }));

  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  if (process.env.GOOGLE_CLIENT_ID) {
    app.get("/api/v1/auth/google", passport.authenticate('google', { scope: ['profile', 'email'] }));
    app.get("/api/v1/auth/google/callback", passport.authenticate('google', { session: false }), (req: any, res) => {
      const token = jwt.sign(
        {
          sub: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          profileImageUrl: req.user.profileImageUrl,
        },
        process.env.JWT_SECRET || "your-jwt-secret-key",
        { expiresIn: '7d' }
      );
      res.redirect(`${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/signin?token=${token}`);
    });
  } else {
    app.get("/api/v1/auth/google", (_req, res) => {
      res.status(500).json({ message: "Google OAuth not configured" });
    });
    app.get("/api/v1/auth/google/callback", (_req, res) => {
      res.status(500).json({ message: "Google OAuth not configured" });
    });
  }

  app.get("/api/v1/auth/providers", (_req, res) => {
    const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const apple = Boolean(process.env.APPLE_CLIENT_ID);
    res.json({ google, apple });
  });

  if (process.env.APPLE_CLIENT_ID) {
    app.get("/api/v1/auth/apple", passport.authenticate('apple'));
    app.post("/api/auth/apple/callback", passport.authenticate('apple', { session: false }), (req: any, res) => {
      const token = jwt.sign(
        {
          sub: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          profileImageUrl: req.user.profileImageUrl,
        },
        process.env.JWT_SECRET || "your-jwt-secret-key",
        { expiresIn: '7d' }
      );
      res.redirect(`${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/signin?token=${token}`);
    });
  }

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