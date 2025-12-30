import express, { type Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { setupAuth, isJwtAuthenticated } from "./auth";
import { insertTripSchema, insertJournalEntrySchema, insertPackingListSchema, SessionModel } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { AiUtilitiesService } from "./AiUtilitiesService";
import { z } from "zod";
import OpenAI from "openai";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { nanoid } from "nanoid";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit per file (to respect Mongo 16MB doc limit)
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);
  const useMemoryStore = !process.env.MONGODB_URI;
  const memoryUsers = new Map<string, {
    id: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    phoneNumber?: string;
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
  }>();

  // Serve uploads directory
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ... (keeping existing variables)

  // Debug: Email Verify Route
  app.get("/api/v1/debug/email-config", async (req, res) => {
    try {
      const { verifySmtpConnection } = await import("./email");
      const result = await verifySmtpConnection();

      const configInfo = {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        passLength: process.env.SMTP_PASS?.length,
        hasPlainAuth: !!process.env.SMTP_AUTH_METHOD
      };

      res.json({
        message: "SMTP Configuration Status",
        timestamp: new Date().toISOString(),
        configSummary: configInfo,
        verificationResult: result
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Debug: Send Test Email
  app.post("/api/v1/debug/send-test-email", async (req, res) => {
    try {
      const { email } = req.body;
      const { sendEmailDetailed } = await import("./email");

      const testEmailOptions = {
        to: email || "kasivasi2005@gmail.com",
        from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "test@tripmate.com",
        subject: "Test Email from TripMate Debugger",
        text: "This is a test email to verify SMTP sending capability.",
        html: "<p>This is a test email to verify SMTP sending capability.</p>"
      };

      const result = await sendEmailDetailed(testEmailOptions);

      if (result.ok) {
        res.json({ success: true, message: "Email sent successfully", messageId: result.messageId });
      } else {
        res.status(500).json({
          success: false,
          message: "Email sending failed",
          error: result.error
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Forgot Password Route
  app.post("/api/v1/auth/forgot-password", async (req, res) => {
    try {
      const { email: rawEmail } = req.body;
      if (!rawEmail) return res.status(400).json({ message: "Email is required" });
      const email = String(rawEmail).toLowerCase().trim();

      let user;
      if (useMemoryStore) {
        user = memoryUsers.get(email);
      } else {
        // Use getUserByEmail to properly find Google OAuth users whose _id is not their email
        user = await storage.getUserByEmail(email);
      }

      if (!user) return res.status(404).json({ message: "User not found" });

      const token = crypto.randomBytes(20).toString("hex");
      const expires = new Date(Date.now() + 3600000); // 1 hour

      if (useMemoryStore) {
        const u = memoryUsers.get(email);
        if (u) {
          u.resetPasswordToken = token;
          u.resetPasswordExpires = expires;
        }
      } else {
        await storage.updateUser(user.id, {
          resetPasswordToken: token,
          resetPasswordExpires: expires,
        });
      }

      // Send email (assuming sendPasswordResetEmail is imported/available)
      // We need to import sendPasswordResetEmail from ./email
      const { sendPasswordResetEmail } = await import("./email");
      const sent = await sendPasswordResetEmail(email, token);
      if (sent) {
        res.json({ message: "Password reset email sent" });
      } else {
        res.status(500).json({ message: "Error sending email" });
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reset Password Route
  app.post("/api/v1/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: "Token and password are required" });

      let user;
      if (useMemoryStore) {
        // Find user by token in memory map (inefficient but strictly for dev fallback)
        for (const u of memoryUsers.values()) {
          if (u.resetPasswordToken === token && u.resetPasswordExpires && u.resetPasswordExpires > new Date()) {
            user = u;
            break;
          }
        }
      } else {
        user = await storage.getUserByResetToken(token);
      }

      if (!user) {
        return res.status(400).json({ message: "Password reset token is invalid or has expired" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      if (useMemoryStore) {
        const u = memoryUsers.get(user.email!);
        if (u) {
          u.password = hashedPassword;
          u.resetPasswordToken = undefined;
          u.resetPasswordExpires = undefined;
        }
      } else {
        await storage.updateUser(user.id, {
          password: hashedPassword,
          resetPasswordToken: undefined,
          resetPasswordExpires: new Date(0), // Ensure it expires immediately
        });
        // Note: Mongoose might treat undefined as "ignore", so we might need null. 
        // But let's stick to the pattern used in auth.ts which used undefined.
      }

      res.json({ message: "Password has been reset" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  const memorySessions = new Map<string, Array<{ sessionId: string; tokenHash: string; device?: string; ip?: string; userAgent?: string; expiresAt: number; revoked?: boolean }>>();
  const devMode = process.env.NODE_ENV !== 'production';
  const optionalAuth = (req: any, res: any, next: any) => {
    if (devMode) return next();
    passport.authenticate('jwt', { session: false }, (err: any, user: any) => {
      // In optional auth, we just attach user if found, but don't error if not
      if (!err && user) {
        req.user = user;
      }
      next();
    })(req, res, next);
  };
  // Rate limiting (disabled globally to prevent app lockups; keep AI limits prod-only)

  app.get('/api/v1/weather/random-cities', optionalAuth, async (req: any, res) => {
    try {
      const key = process.env.OPENWEATHER_API_KEY || '';
      if (!key) return res.status(503).json({ status: 'error', code: 503, message: 'weather api key missing' });
      const count = Math.min(20, Math.max(1, Number(req.query.count || 5)));
      const list = [
        'Delhi', 'Mumbai', 'Vadodara', 'Ahmedabad', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Jaipur', 'Surat', 'Lucknow', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Patna', 'Kanpur', 'Agra', 'Noida', 'Gandhinagar', 'Rajkot'
      ];
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[list[i], list[j]] = [list[j], list[i]]; }
      const sample = list.slice(0, count);
      const results: any[] = [];
      for (const city of sample) {
        try {
          const g = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${key}`);
          if (!g.ok) {
            results.push({ status: 'error', city, code: g.status, message: 'geocode_failed' });
            continue;
          }
          const arr = await g.json();
          const first = Array.isArray(arr) && arr.length ? arr[0] : null;
          if (!first || !Number.isFinite(first.lat) || !Number.isFinite(first.lon)) {
            results.push({ status: 'error', city, code: 404, message: 'location_not_found' });
            continue;
          }
          const lat = Number(first.lat);
          const lon = Number(first.lon);
          const ocUrl = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=metric&lang=en&appid=${key}`;
          const r = await fetch(ocUrl);
          if (!r.ok) {
            if (r.status === 429) {
              results.push({ status: 'error', city, code: 429, message: 'rate_limited' });
              continue;
            }
            const rcUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=en&appid=${key}`;
            const rfUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=en&appid=${key}`;
            const [rc, rf] = await Promise.allSettled([fetch(rcUrl), fetch(rfUrl)]);
            if (rc.status !== 'fulfilled' || rf.status !== 'fulfilled' || !(rc.value as any).ok || !(rf.value as any).ok) {
              results.push({ status: 'error', city, code: 502, message: 'providers_unavailable' });
              continue;
            }
            const currentJson = await (rc.value as any).json();
            const forecastJson = await (rf.value as any).json();
            const condMain = currentJson?.weather?.[0]?.main || 'Clear';
            const windDeg = Number(currentJson?.wind?.deg ?? 0);
            const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
            const windDir = dirs[Math.round(((windDeg % 360) / 22.5)) % 16];
            const current = {
              temperature: Math.round(currentJson?.main?.temp ?? 22),
              tempMin: Math.round(currentJson?.main?.temp_min ?? Math.max(0, Math.round(currentJson?.main?.temp ?? 22) - 5)),
              tempMax: Math.round(currentJson?.main?.temp_max ?? Math.round(currentJson?.main?.temp ?? 22)),
              condition: condMain,
              humidity: Math.round(currentJson?.main?.humidity ?? 60),
              windSpeed: Math.round(currentJson?.wind?.speed ?? 10),
              windDeg,
              windDir,
              // Advanced metrics
              uvi: 0, // Standard API doesn't provide UV
              visibility: currentJson?.visibility ?? 10000,
              pressure: currentJson?.main?.pressure ?? 1013,
              sunrise: currentJson?.sys?.sunrise ?? 0,
              sunset: currentJson?.sys?.sunset ?? 0,
            };
            const list3 = Array.isArray(forecastJson?.list) ? forecastJson.list : [];
            const daysMap: Record<string, { high: number; low: number; main: string }> = {};
            list3.forEach((item: any) => {
              const dtTxt = String(item?.dt_txt || '');
              const dayKey = dtTxt.slice(0, 10);
              const temp = Number(item?.main?.temp ?? current.temperature);
              const main = item?.weather?.[0]?.main || 'Clear';
              const d = daysMap[dayKey] || { high: -Infinity, low: Infinity, main };
              d.high = Math.max(d.high, temp);
              d.low = Math.min(d.low, temp);
              if (d.main === 'Clear' && main !== 'Clear') d.main = main;
              daysMap[dayKey] = d;
            });
            const keys = Object.keys(daysMap).sort().slice(0, 7);
            const forecast = keys.map((k, i) => ({
              day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
              high: Math.round(daysMap[k].high),
              low: Math.round(daysMap[k].low),
              condition: daysMap[k].main,
            }));
            results.push({ status: 'ok', city, coordinates: { lat, lon }, current, forecast, source: 'openweather' });
            continue;
          }
          const j = await r.json();
          const condMain = j.current?.weather?.[0]?.main || 'Clear';
          const day0 = Array.isArray(j.daily) && j.daily.length ? j.daily[0] : null;
          const windDeg = Number(j.current?.wind_deg ?? 0);
          const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
          const windDir = dirs[Math.round(((windDeg % 360) / 22.5)) % 16];
          const current = {
            temperature: Math.round(j.current?.temp ?? 22),
            tempMin: Math.round(day0?.temp?.min ?? Math.max(0, Math.round(j.current?.temp ?? 22) - 5)),
            tempMax: Math.round(day0?.temp?.max ?? Math.round(j.current?.temp ?? 22)),
            condition: condMain,
            humidity: Math.round(j.current?.humidity ?? 60),
            windSpeed: Math.round(j.current?.wind_speed ?? 10),
            windDeg,
            windDir,
            // Advanced metrics
            uvi: j.current?.uvi ?? 0,
            visibility: j.current?.visibility ?? 10000,
            pressure: j.current?.pressure ?? 1013,
            sunrise: j.current?.sunrise ?? 0,
            sunset: j.current?.sunset ?? 0,
          };
          const forecast = Array.isArray(j.daily) ? j.daily.slice(0, 7).map((d: any, i: number) => ({
            day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
            high: Math.round(d.temp?.max ?? current.temperature),
            low: Math.round(d.temp?.min ?? Math.max(0, current.temperature - 5)),
            condition: d.weather?.[0]?.main || 'Clear',
          })) : [];
          results.push({ status: 'ok', city, coordinates: { lat, lon }, current, forecast, source: 'openweather' });
        } catch (e: any) {
          results.push({ status: 'error', city, code: 500, message: 'unexpected_error' });
        }
      }
      return res.json({ status: 'ok', count: results.length, items: results });
    } catch (error) {
      console.error('weather random cities error:', error);
      return res.status(500).json({ status: 'error', code: 500, message: 'server_error' });
    }
  });

  app.get('/api/v1/weather/tiles/:layer/:z/:x/:y', async (req, res) => {
    try {
      const { layer, z, x, y } = req.params;
      const key = process.env.OPENWEATHER_API_KEY;
      if (!key) return res.status(503).send('API Key missing');

      const url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=${key}`;
      const response = await fetch(url);

      if (!response.ok) return res.status(response.status).send('Tile fetch failed');

      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'image/png');
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error('Tile proxy error:', error);
      res.status(500).send('Proxy error');
    }
  });

  if (!devMode) {
    // Removed global API limiter to avoid 429 lockups
  }

  // Auth middleware
  // await setupAuth(app); // Already called at top of function

  // Cookies
  app.use(cookieParser());

  const ACCESS_TTL_MINUTES = 15;
  const REFRESH_TTL_SHORT_HOURS = 12; // when remember=false
  const REFRESH_TTL_LONG_DAYS = 30; // when remember=true

  function generateAccessToken(user: any): string {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        phone_number: (user as any).phoneNumber || "",
      },
      process.env.JWT_SECRET || "your-jwt-secret-key",
      { expiresIn: `${ACCESS_TTL_MINUTES}m` }
    );
  }

  function createRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  function setRefreshCookie(res: any, token: string, ttlMs: number) {
    res.cookie('rt', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ttlMs,
    });
  }

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Image proxy for profile editor to avoid canvas taint issues
  app.get('/api/v1/proxy-image', async (req: any, res) => {
    try {
      const rawUrl = String(req.query.url || '').trim();
      if (!rawUrl) return res.status(400).json({ message: 'url is required' });
      const u = new URL(rawUrl);
      if (!['http:', 'https:'].includes(u.protocol)) return res.status(400).json({ message: 'invalid protocol' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const r = await fetch(rawUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) return res.status(r.status).json({ message: r.statusText });
      const ct = r.headers.get('content-type') || 'application/octet-stream';
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ message: 'image too large' });
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch (e: any) {
      res.status(500).json({ message: 'proxy_error' });
    }
  });

  // OAuth Routes - Moved from auth.ts to share session logic
  app.get("/api/v1/auth/providers", (_req, res) => {
    const google = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const apple = Boolean(process.env.APPLE_CLIENT_ID);
    res.json({ google, apple });
  });

  if (process.env.GOOGLE_CLIENT_ID) {
    app.get("/api/v1/auth/google", passport.authenticate('google', { scope: ['profile', 'email'] }));

    app.get("/api/v1/auth/google/callback", passport.authenticate('google', { session: false }), async (req: any, res) => {
      try {
        const user = req.user;
        if (!user) return res.redirect(`${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/signin?error=auth_failed`);

        // Create Session (Persistent for OAuth)
        const accessToken = generateAccessToken(user);
        const refreshToken = createRefreshToken();
        const tokenHash = hashToken(refreshToken);
        // OAuth logins are assumed to be "Remember Me" (Long TTL)
        const ttlMs = REFRESH_TTL_LONG_DAYS * 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + ttlMs;
        const sessionId = nanoid();
        const device = 'web'; // Default for OAuth callback
        const ipAddr = String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '')).split(',')[0];
        const userAgent = String(req.headers['user-agent'] || '');

        if (useMemoryStore) {
          const arr = memorySessions.get(user.id) || [];
          arr.push({ sessionId, tokenHash, device, ip: ipAddr, userAgent, expiresAt, revoked: false });
          memorySessions.set(user.id, arr);
        } else {
          await SessionModel.create({ userId: user.id, sessionId, tokenHash, device, ip: ipAddr, userAgent, expiresAt: new Date(expiresAt), revoked: false });
        }

        setRefreshCookie(res, refreshToken, ttlMs);

        // Redirect with Access Token
        res.redirect(`${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/signin?token=${accessToken}`);
      } catch (error) {
        console.error("Google OAuth callback error:", error);
        res.redirect(`${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/signin?error=server_error`);
      }
    });
  } else {
    app.get("/api/v1/auth/google", (_req, res) => {
      res.status(500).json({ message: "Google OAuth not configured" });
    });
    app.get("/api/v1/auth/google/callback", (_req, res) => {
      res.status(500).json({ message: "Google OAuth not configured" });
    });
  }

  if (process.env.APPLE_CLIENT_ID) {
    app.get("/api/v1/auth/apple", passport.authenticate('apple'));
    app.post("/api/auth/apple/callback", passport.authenticate('apple', { session: false }), async (req: any, res) => {
      try {
        const user = req.user;
        if (!user) return res.redirect(`${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/signin?error=auth_failed`);

        // Create Session (Persistent for OAuth)
        const accessToken = generateAccessToken(user);
        const refreshToken = createRefreshToken();
        const tokenHash = hashToken(refreshToken);
        const ttlMs = REFRESH_TTL_LONG_DAYS * 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + ttlMs;
        const sessionId = nanoid();
        const device = 'web';
        const ipAddr = String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '')).split(',')[0];
        const userAgent = String(req.headers['user-agent'] || '');

        if (useMemoryStore) {
          const arr = memorySessions.get(user.id) || [];
          arr.push({ sessionId, tokenHash, device, ip: ipAddr, userAgent, expiresAt, revoked: false });
          memorySessions.set(user.id, arr);
        } else {
          await SessionModel.create({ userId: user.id, sessionId, tokenHash, device, ip: ipAddr, userAgent, expiresAt: new Date(expiresAt), revoked: false });
        }

        setRefreshCookie(res, refreshToken, ttlMs);

        res.redirect(`${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/signin?token=${accessToken}`);
      } catch (error) {
        console.error("Apple OAuth callback error:", error);
        res.redirect(`${process.env.FRONTEND_URL || 'https://tripmate-ylt6.onrender.com'}/signin?error=server_error`);
      }
    });
  }

  // Auth routes - JWT only
  app.post('/api/v1/auth/signin', async (req, res) => {
    try {
      const { email: rawEmail, password, remember } = req.body || {};
      const email = String(rawEmail || '').toLowerCase().trim();
      const ip = String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '')).split(',')[0];
      const key = `${email}|${ip}`;
      console.log(`[Auth] Attempting signin for: ${email}`);
      let user;
      if (useMemoryStore) {
        const u = memoryUsers.get(email);
        if (u) {
          user = { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, profileImageUrl: u.profileImageUrl } as any;
          (user as any).password = u.password;
        }
      } else {
        user = await storage.getUser(email);
      }
      if (!user) {
        console.log(`[Auth] User not found: ${email}`);
        await new Promise(resolve => setTimeout(resolve, 300));
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password - use bcrypt for all users
      console.log(`[Auth] User found. Has password? ${!!user.password}`);
      if (!user.password) {
        console.log(`[Auth] No password set for user (Google account).`);
        await new Promise(resolve => setTimeout(resolve, 300));
        return res.status(401).json({ message: "This account uses Google Sign-In. Please sign in with Google." });
      }

      const isValid = await bcrypt.compare(password, user.password);
      console.log(`[Auth] Password valid? ${isValid}`);
      if (!isValid) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const accessToken = generateAccessToken(user);
      const refreshToken = createRefreshToken();
      const tokenHash = hashToken(refreshToken);
      const ttlMs = (remember ? REFRESH_TTL_LONG_DAYS * 24 * 60 * 60 * 1000 : REFRESH_TTL_SHORT_HOURS * 60 * 60 * 1000);
      const expiresAt = Date.now() + ttlMs;
      const sessionId = nanoid();
      const device = String(req.body?.device || 'web');
      const ipAddr = ip;
      const userAgent = String(req.headers['user-agent'] || '');

      if (useMemoryStore) {
        const arr = memorySessions.get(user.id) || [];
        arr.push({ sessionId, tokenHash, device, ip: ipAddr, userAgent, expiresAt, revoked: false });
        memorySessions.set(user.id, arr);
      } else {
        await SessionModel.create({ userId: user.id, sessionId, tokenHash, device, ip: ipAddr, userAgent, expiresAt: new Date(expiresAt), revoked: false });
      }

      setRefreshCookie(res, refreshToken, ttlMs);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          phoneNumber: (user as any).phoneNumber || "",
        },
        token: accessToken
      });
    } catch (error) {
      console.error("Sign in error:", error);
      res.status(500).json({ message: "Sign in failed" });
    }

  });

  // Guest Login Route
  app.post('/api/v1/auth/guest', async (req, res) => {
    try {
      const email = `guest_${nanoid()}@tripmate.local`;
      const password = nanoid(); // Random password, not used
      const hashedPassword = await bcrypt.hash(password, 10);
      const ip = String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '')).split(',')[0];

      let user: any;
      if (useMemoryStore) {
        const id = nanoid();
        const newUser = {
          id,
          email,
          password: hashedPassword,
          firstName: "Guest",
          lastName: "User",
          profileImageUrl: "",
          phoneNumber: "",
          isGuest: true
        };
        memoryUsers.set(email, newUser);
        user = newUser;
      } else {
        user = await storage.upsertUser({
          _id: nanoid(), // Ensure unique ID
          email,
          password: hashedPassword,
          firstName: "Guest",
          lastName: "User",
          profileImageUrl: "",
          phoneNumber: "",
          isGuest: true
        });
      }

      // For guests: ONLY access token, NO refresh cookie/session
      // This means guests will be logged out after 15 minutes (access token expiry)
      const accessToken = generateAccessToken(user);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          isGuest: true
        },
        token: accessToken
      });

    } catch (error) {
      console.error("Guest login error:", error);
      res.status(500).json({ message: "Guest login failed" });
    }
  });

  // Profile Avatar Upload Route (Base64 Storage for Render Persistence)
  app.post('/api/v1/auth/user/avatar', isJwtAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      const userId = req.user.claims?.sub || req.user.id;
      const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

      const updatedUser = await storage.updateUser(userId, { profileImageUrl: base64Image });
      if (!updatedUser) return res.status(404).json({ message: 'User not found' });

      res.json({
        message: 'Avatar updated',
        user: {
          ...updatedUser,
          password: undefined
        }
      });
    } catch (error) {
      console.error('Avatar upload error:', error);
      res.status(500).json({ message: 'Failed to update avatar' });
    }
  });

  // Update Profile Details Route
  app.put('/api/v1/auth/user', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const { firstName, lastName, phoneNumber } = req.body;

      const updatedUser = await storage.updateUser(userId, {
        firstName,
        lastName,
        phoneNumber
      });

      if (!updatedUser) return res.status(404).json({ message: 'User not found' });
      res.json(updatedUser);
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ message: 'Failed to update profile' });
    }
  });

  // Get Current User Route
  app.get('/api/v1/auth/user', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      if (!user) return res.sendStatus(401);
      res.json(user);
    } catch (e) {
      res.sendStatus(500);
    }
  });

  app.post('/api/v1/auth/signup', async (req, res) => {
    try {
      const { email: rawEmail, password, firstName, lastName } = req.body;
      const email = String(rawEmail || '').toLowerCase().trim();

      let existingUser;
      if (useMemoryStore) {
        existingUser = memoryUsers.get(email) as any;
      } else {
        existingUser = await storage.getUser(email);
      }

      if (existingUser) {
        // If user exists but has no password (e.g. created via Google), allow setting a password
        // This enables "both logins to work" as requested
        if (!existingUser.password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          if (useMemoryStore) {
            const u = memoryUsers.get(email) as any;
            u.password = hashedPassword;
            if (!u.firstName && firstName) u.firstName = firstName;
            if (!u.lastName && lastName) u.lastName = lastName;
          } else {
            await storage.updateUser(existingUser.id, {
              password: hashedPassword,
              firstName: existingUser.firstName || firstName,
              lastName: existingUser.lastName || lastName
            });
          }
          // Proceed to login logic below...
          // We need to re-fetch or use the updated user object. 
          // Simpler to just fall through to token generation if we structure correctly.
          // However, the existing code structure creates a NEW user in the `else` block or `if (!existingUser)` block.
          // Let's refactor slightly to support this flow.
        } else {
          return res.status(400).json({ message: "User already exists" });
        }
      }

      // Hash password (only if not already done above implementation, but let's restructure for clarity)
      // Actually, cleaner replacement might be:

      let user = existingUser;

      if (existingUser) {
        if (existingUser.password) {
          return res.status(400).json({ message: "User already exists" });
        }
        // Update existing Google user with password
        const hashedPassword = await bcrypt.hash(password, 10);
        if (useMemoryStore) {
          const u = memoryUsers.get(email) as any;
          u.password = hashedPassword;
          if (!u.firstName && firstName) u.firstName = firstName;
          if (!u.lastName && lastName) u.lastName = lastName;
          user = u;
        } else {
          user = await storage.updateUser(existingUser.id, {
            password: hashedPassword,
            firstName: existingUser.firstName || firstName,
            lastName: existingUser.lastName || lastName
          });
        }
      } else {
        // Create new user
        const hashedPassword = await bcrypt.hash(password, 10);
        if (useMemoryStore) {
          const id = email;
          const newUser = { id, email, password: hashedPassword, firstName, lastName, profileImageUrl: "", phoneNumber: "" };
          memoryUsers.set(email, newUser);
          user = newUser as any;
        } else {
          user = await storage.upsertUser({
            _id: email,
            email,
            password: hashedPassword,
            firstName,
            lastName,
            profileImageUrl: "",
            phoneNumber: "",
          });
        }
      }

      const accessToken = generateAccessToken(user);
      const refreshToken = createRefreshToken();
      const tokenHash = hashToken(refreshToken);
      const ttlMs = REFRESH_TTL_LONG_DAYS * 24 * 60 * 60 * 1000;
      const expiresAt = Date.now() + ttlMs;
      const sessionId = nanoid();
      const device = String(req.body?.device || 'web');
      const ipAddr = String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '')).split(',')[0];
      const userAgent = String(req.headers['user-agent'] || '');

      if (useMemoryStore) {
        const arr = memorySessions.get(user.id) || [];
        arr.push({ sessionId, tokenHash, device, ip: ipAddr, userAgent, expiresAt, revoked: false });
        memorySessions.set(user.id, arr);
      } else {
        await SessionModel.create({ userId: user.id, sessionId, tokenHash, device, ip: ipAddr, userAgent, expiresAt: new Date(expiresAt), revoked: false });
      }

      setRefreshCookie(res, refreshToken, ttlMs);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          phoneNumber: (user as any).phoneNumber || "",
        },
        token: accessToken
      });
    } catch (error) {
      console.error("Sign up error:", error);
      res.status(500).json({ message: "Sign up failed" });
    }
  });

  app.post('/api/v1/auth/signout', async (req: any, res) => {
    try {
      const rt: string | undefined = req.cookies?.rt;
      if (rt) {
        const hash = hashToken(rt);
        if (useMemoryStore) {
          for (const [uid, sessions] of memorySessions.entries()) {
            for (const s of sessions) {
              if (s.tokenHash === hash) s.revoked = true;
            }
          }
        } else {
          await SessionModel.updateMany({ tokenHash: hash }, { $set: { revoked: true } });
        }
      }
      res.clearCookie('rt', { path: '/' });
      res.json({ message: "Signed out successfully" });
    } catch (e) {
      res.clearCookie('rt', { path: '/' });
      res.json({ message: "Signed out" });
    }
  });

  app.post('/api/v1/auth/refresh', async (req: any, res) => {
    try {
      const rt: string | undefined = req.cookies?.rt;
      if (!rt) return res.status(401).json({ message: 'No refresh token' });
      const hash = hashToken(rt);
      const now = Date.now();
      let session: any | null = null;
      let userId: string | null = null;
      if (useMemoryStore) {
        for (const [uid, sessions] of memorySessions.entries()) {
          const found = sessions.find(s => s.tokenHash === hash && !s.revoked && s.expiresAt > now);
          if (found) { session = found; userId = uid; break; }
        }
      } else {
        const s = await SessionModel.findOne({ tokenHash: hash, revoked: false }).exec();
        if (s && s.expiresAt.getTime() > now) { session = s; userId = s.userId; }
      }
      if (!session || !userId) return res.status(401).json({ message: 'Invalid refresh token' });

      // rotate refresh token
      const newRt = createRefreshToken();
      const newHash = hashToken(newRt);
      const originalExpiresMs = useMemoryStore ? Number(session.expiresAt) : Number(session.expiresAt?.getTime?.() || Date.now());
      const rememberLong = (originalExpiresMs - now) > (24 * 60 * 60 * 1000);
      const ttlMs = (rememberLong ? REFRESH_TTL_LONG_DAYS * 24 * 60 * 60 * 1000 : REFRESH_TTL_SHORT_HOURS * 60 * 60 * 1000);
      const expiresAt = Date.now() + ttlMs;

      const newSessionId = nanoid();
      if (useMemoryStore) {
        const arr = memorySessions.get(userId) || [];
        // add new first with a fresh session id
        arr.push({ sessionId: newSessionId, tokenHash: newHash, device: session.device, ip: session.ip, userAgent: session.userAgent, expiresAt, revoked: false });
        // then revoke old
        arr.forEach(s => { if (s.tokenHash === hash) s.revoked = true; });
        memorySessions.set(userId, arr);
      } else {
        // create new first
        await SessionModel.create({ userId, sessionId: newSessionId, tokenHash: newHash, device: session.device, ip: session.ip, userAgent: session.userAgent, expiresAt: new Date(expiresAt), revoked: false });
        // then revoke old
        await SessionModel.updateMany({ tokenHash: hash }, { $set: { revoked: true } });
      }

      setRefreshCookie(res, newRt, ttlMs);

      // issue access token
      let user: any = null;
      if (useMemoryStore) {
        const mem = memoryUsers.get(userId);
        if (mem) user = { id: mem.id, email: mem.email, firstName: mem.firstName, lastName: mem.lastName, profileImageUrl: mem.profileImageUrl, phoneNumber: mem.phoneNumber };
      } else {
        user = await storage.getUser(userId);
      }
      if (!user) return res.status(401).json({ message: 'User not found' });

      const accessToken = generateAccessToken(user);
      res.json({ token: accessToken });
    } catch (e) {
      res.status(500).json({ message: 'Refresh failed' });
    }
  });

  app.post('/api/v1/auth/logout-all', isJwtAuthenticated, async (req: any, res) => {
    try {
      const uid = req.user?.claims?.sub || req.user?.id;
      if (!uid) return res.status(401).json({ message: 'Unauthorized' });
      if (useMemoryStore) {
        const arr = memorySessions.get(uid) || [];
        arr.forEach(s => s.revoked = true);
        memorySessions.set(uid, arr);
      } else {
        await SessionModel.updateMany({ userId: uid }, { $set: { revoked: true } });
      }
      res.clearCookie('rt', { path: '/' });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false });
    }
  });

  app.get('/api/v1/auth/sessions', isJwtAuthenticated, async (req: any, res) => {
    try {
      const uid = req.user?.claims?.sub || req.user?.id;
      if (!uid) return res.status(401).json({ message: 'Unauthorized' });
      if (useMemoryStore) {
        const arr = (memorySessions.get(uid) || []).filter(s => !s.revoked);
        return res.json(arr.map(s => ({ id: s.sessionId, device: s.device, ip: s.ip, userAgent: s.userAgent, expiresAt: new Date(s.expiresAt).toISOString() })));
      } else {
        const sessions = await SessionModel.find({ userId: uid, revoked: false }).sort({ createdAt: -1 }).exec();
        return res.json(sessions.map(s => ({ id: s.sessionId, device: s.device, ip: s.ip, userAgent: s.userAgent, expiresAt: s.expiresAt.toISOString() })));
      }
    } catch {
      res.status(500).json([]);
    }
  });

  app.post('/api/v1/auth/sessions/:id/revoke', isJwtAuthenticated, async (req: any, res) => {
    try {
      const uid = req.user?.claims?.sub || req.user?.id;
      const sid = String(req.params.id || '');
      if (!uid || !sid) return res.status(400).json({ ok: false });
      if (useMemoryStore) {
        const arr = memorySessions.get(uid) || [];
        arr.forEach(s => { if (s.sessionId === sid) s.revoked = true; });
        memorySessions.set(uid, arr);
      } else {
        await SessionModel.updateOne({ userId: uid, sessionId: sid }, { $set: { revoked: true } });
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false });
    }
  });

  app.post('/api/v1/auth/user/avatar', isJwtAuthenticated, upload.single('image'), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: 'No image provided' });
      }
      const url = `/uploads/${file.filename}`;

      if (useMemoryStore) {
        const existing = memoryUsers.get(userId);
        if (existing) {
          const updatedMem = { ...existing, profileImageUrl: url };
          memoryUsers.set(userId, updatedMem);
          return res.json({ id: updatedMem.id, email: updatedMem.email, firstName: updatedMem.firstName, lastName: updatedMem.lastName, profileImageUrl: updatedMem.profileImageUrl, phoneNumber: updatedMem.phoneNumber });
        }
        return res.status(404).json({ message: 'User not found' });
      }

      const updated = await storage.upsertUser({ _id: userId, profileImageUrl: url } as any);
      res.json(updated);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      res.status(500).json({ message: 'Failed to upload avatar' });
    }
  });

  app.get('/api/v1/auth/user', isJwtAuthenticated, async (req: any, res) => {
    try {
      const claims = req.user.claims || req.user;
      const userId = claims?.sub || req.user.id;
      if (useMemoryStore) {
        const mem = memoryUsers.get(userId);
        if (!mem) return res.status(401).json({ message: 'User not found' });
        return res.json({
          id: mem.id,
          email: mem.email,
          firstName: mem.firstName || '',
          lastName: mem.lastName || '',
          profileImageUrl: mem.profileImageUrl || '',
          phoneNumber: mem.phoneNumber || '',
        });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.put('/api/v1/auth/user', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || req.user?.id;
      const updateSchema = z.object({
        firstName: z.string().trim().optional(),
        lastName: z.string().trim().optional(),
        profileImageUrl: z.string().url().optional(),
        phoneNumber: z.string().trim().optional(),
      });
      const updates = updateSchema.parse(req.body || {});

      if (useMemoryStore) {
        const existing = memoryUsers.get(userId);
        if (existing) {
          const updatedMem = { ...existing, ...updates };
          memoryUsers.set(userId, updatedMem);
          return res.json({ id: updatedMem.id, email: updatedMem.email, firstName: updatedMem.firstName, lastName: updatedMem.lastName, profileImageUrl: updatedMem.profileImageUrl, phoneNumber: updatedMem.phoneNumber });
        }
        return res.status(404).json({ message: 'User not found' });
      }

      const updated = await storage.updateUser(userId, updates as any);
      res.json(updated);
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(400).json({ message: 'Invalid user data' });
    }
  });

  // Trip routes
  app.delete('/api/v1/trips', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      await storage.deleteAllTrips(userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting all trips:", error);
      res.status(500).json({ message: "Failed to delete trips" });
    }
  });

  app.get('/api/v1/trips', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const light = req.query.light === 'true';
      const trips = await storage.getUserTrips(userId, { excludeHeavyFields: light });
      res.json(trips);
    } catch (error) {
      console.error("Error fetching trips:", error);
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  app.post('/api/v1/trips', isJwtAuthenticated, async (req: any, res) => {
    try {
      console.log("[Trip Create] Request received from user:", req.user?.id);
      console.log("[Trip Create] Payload keys:", Object.keys(req.body));

      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // Guest Limitation: Max 1 Trip
      const user = await storage.getUser(userId);
      if (user?.isGuest) {
        const existingTrips = await storage.getUserTrips(userId);
        if (existingTrips.length >= 1) {
          return res.status(403).json({ message: "Guest limit reached: Max 1 trip allowed. Please sign up for more." });
        }
      }

      const tripData = insertTripSchema.parse({
        ...req.body,
        userId: req.user!.id,
        days: typeof req.body.days === 'string' ? parseInt(req.body.days) : req.body.days,
        groupSize: typeof req.body.groupSize === 'string' ? parseInt(req.body.groupSize) : req.body.groupSize,
      });

      console.log("[Trip Create] Parsed data, attempting storage create...");
      const savedTrip = await storage.createTrip(tripData);
      console.log("[Trip Create] Storage create success. ID:", savedTrip._id, "Virtual ID:", savedTrip.id);

      if (!savedTrip._id) {
        console.error("[Trip Create] CRITICAL: Saved trip has no _id!", savedTrip);
        throw new Error("Trip creation failed: no ID generated");
      }

      const responsePayload = {
        ...savedTrip.toJSON(),
        id: savedTrip._id.toString(),
        _id: savedTrip._id.toString() // Ensure both are present for client compatibility
      };
      console.log("[Trip Create] Sending response payload:", JSON.stringify(responsePayload));

      // Automatically fetch destination image in the background (non-blocking)
      const tripId = savedTrip._id.toString();
      const destination = savedTrip.destination;
      setImmediate(async () => {
        try {
          const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
          if (!key) return;

          const q = `${destination} tourism scenery landmark`;
          const searchRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${key}`);
          const searchData = await searchRes.json();

          if (searchData.results && searchData.results.length > 0) {
            const photoRef = searchData.results[0].photos?.[0]?.photo_reference;
            if (photoRef) {
              const imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${key}`;
              await storage.updateTrip(tripId, userId, { imageUrl } as any);
              console.log(`[Trip Create] Auto-fetched image for trip ${tripId}: ${imageUrl}`);
            }
          }
        } catch (err) {
          console.error(`[Trip Create] Failed to auto-fetch image for trip ${tripId}:`, err);
        }
      });

      res.status(201).json(responsePayload);
    } catch (error) {
      console.error("[Trip Create] Error:", error);
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        res.status(400).json({ message: `Invalid trip data: ${issues}` });
      } else {
        res.status(400).json({ message: "Invalid trip data" });
      }
    }
  });

  app.get('/api/v1/trips/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const trip = await storage.getTrip(tripId, userId);
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      res.json(trip);
    } catch (error) {
      console.error("Error fetching trip:", error);
      res.status(500).json({ message: "Failed to fetch trip" });
    }
  });

  app.put('/api/v1/trips/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      // Convert budget string to number if provided
      const processedBody = {
        ...req.body,
        budget: req.body.budget ? parseFloat(req.body.budget) : undefined
      };

      const updates = insertTripSchema.partial().parse(processedBody);

      // Fetch existing trip to compare
      const existingTrip = await storage.getTrip(tripId, userId);
      if (!existingTrip) {
        return res.status(404).json({ message: "Trip not found" });
      }

      // Check if critical fields changed
      const destinationChanged = updates.destination && updates.destination !== existingTrip.destination;
      const daysChanged = updates.days && updates.days !== existingTrip.days;
      const budgetChanged = updates.budget !== undefined && Math.abs(updates.budget - (existingTrip.budget || 0)) > 1; // Tolerance for float

      if (destinationChanged || daysChanged || budgetChanged) {
        console.log(`[Trip Update] Critical fields changed for Trip ${tripId}. Regenerating itinerary...`);
        console.log(`[Trip Update] Changes: Dest=${destinationChanged}, Days=${daysChanged}, Budget=${budgetChanged}`);

        // Use new values or fall back to existing
        const planInput = {
          destination: updates.destination || existingTrip.destination,
          days: updates.days || existingTrip.days,
          persons: updates.groupSize || existingTrip.groupSize, // Map groupSize to persons
          budget: updates.budget ?? existingTrip.budget,
          currency: (existingTrip as any).currency || 'INR', // Preserve existing currency
          typeOfTrip: updates.travelStyle || existingTrip.travelStyle, // Map travelStyle to typeOfTrip
          travelMedium: (existingTrip as any).travelMedium || 'flight' // Default if missing
        };

        // Regenerate plan
        // Note: ai variable is captured from outer scope (ensure it is initialized)
        const newPlan = await ai.planTrip(planInput);

        if (!newPlan || (newPlan as any).error) {
          console.error("[Trip Update] Regeneration failed:", newPlan);
          // Verify if we should abort or just save metadata. 
          // Let's abort to warn the user, or fallback? 
          // User expects "Regenerate", so silence is bad. 
          // But failing the save is also annoying.
          // We will proceed with metadata update but add a warning flag?
          // Actually, planTrip usually returns a fallback if AI fails.
          // So if it's still an error, it's a hard error.
        } else {
          // Merge new plan into updates
          // Schema expects specific fields. 
          // We need to map `newPlan` structure to `Trip` schema structure if they differ.
          // `planTrip` returns: { itinerary, costBreakdown, packingList, ... }
          // `Trip` schema: { itinerary: json, costBreakdown: json, ... }
          // They should match since existing creation flow uses them.
          (updates as any).itinerary = (newPlan as any).itinerary;
          (updates as any).costBreakdown = (newPlan as any).costBreakdown;
          (updates as any).packingList = (newPlan as any).packingList;

          // Sync main budget field with AI estimated total if not explicitly set by user to a non-zero value
          // or if the previous budget was 0 (implying "calculate for me")
          const estimatedTotal = (newPlan as any).costBreakdown?.total || (newPlan as any).costBreakdown?.totalINR;
          if (estimatedTotal && (!updates.budget || updates.budget === 0)) {
            (updates as any).budget = estimatedTotal;
          }

          // Don't overwrite notes if user is passing them, but maybe append?
          // For now, let's keep user's manual notes update if provided, else keep existing.
          if (!updates.notes) {
            // If user didn't edit notes, maybe update them?
            // Often user notes are personal. Let's leave notes alone unless user edited them.
          }
        }
      }

      const trip = await storage.updateTrip(tripId, userId, updates);
      res.json(trip);
    } catch (error) {
      console.error("Error updating trip:", error);
      res.status(400).json({ message: "Invalid trip data" });
    }
  });

  // Generate/Fetch Trip Hero Image
  app.post('/api/v1/trips/:id/image', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const trip = await storage.getTrip(tripId, userId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      if (trip.imageUrl && req.query.force !== 'true') return res.json({ imageUrl: trip.imageUrl });

      // Fetch from Google Places
      const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return res.status(503).json({ message: "Image service unavailable" });

      // Improved query: destination + landmark/scenery to avoid people and get "highlight" images
      const q = `${trip.destination} tourism scenery landmark`;
      const searchRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${key}`);
      const searchData = await searchRes.json();

      let imageUrl = null;
      if (searchData.results && searchData.results.length > 0) {
        const photoRef = searchData.results[0].photos?.[0]?.photo_reference;
        if (photoRef) {
          imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoRef}&key=${key}`;
        }
      }

      if (imageUrl) {
        await storage.updateTrip(tripId, userId, { imageUrl } as any);
        return res.json({ imageUrl });
      }

      res.status(404).json({ message: "No image found" });
    } catch (error) {
      console.error("Error fetching trip image:", error);
      res.status(500).json({ message: "Failed to fetch image" });
    }
  });

  // Discover places near trip destination (Hotels, Restaurants, Tourist Spots)
  app.post('/api/v1/trips/:id/discover', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const { category, query } = req.body;

      const trip = await storage.getTrip(tripId, userId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return res.status(503).json({ message: "Service unavailable" });

      // Build search query based on category
      const categoryQueries: Record<string, string> = {
        hotels: `hotels in ${trip.destination}`,
        restaurants: `restaurants in ${trip.destination}`,
        'tourist-spots': `tourist attractions in ${trip.destination}`
      };

      const searchQuery = query || categoryQueries[category] || trip.destination;
      const searchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${key}`
      );
      const searchData = await searchRes.json();

      if (!searchData.results || searchData.results.length === 0) {
        return res.json({ places: [] });
      }

      // Format results with essential info
      const places = searchData.results.slice(0, 10).map((place: any) => ({
        id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating,
        photos: place.photos ? [
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${key}`
        ] : [],
        location: place.geometry?.location,
        priceLevel: place.price_level,
        types: place.types
      }));

      res.json({ places });
    } catch (error) {
      console.error("Error discovering places:", error);
      res.status(500).json({ message: "Failed to discover places" });
    }
  });

  // Get AI-powered recommendations for hotels, restaurants, or tourist spots
  app.post('/api/v1/trips/:id/ai-recommendations', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const { category } = req.body;

      const trip = await storage.getTrip(tripId, userId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return res.status(503).json({ message: "Service unavailable" });

      // First, get places from Google
      const categoryQueries: Record<string, string> = {
        hotels: `hotels in ${trip.destination}`,
        restaurants: `best restaurants in ${trip.destination}`,
        'tourist-spots': `top tourist attractions in ${trip.destination}`
      };

      const searchQuery = categoryQueries[category] || trip.destination;
      const searchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${key}`
      );
      const searchData = await searchRes.json();

      if (!searchData.results || searchData.results.length === 0) {
        return res.json({ recommendations: [], reasoning: "No places found in this area." });
      }

      // Get AI to rank and explain recommendations
      const places = searchData.results.slice(0, 10);
      const prompt = `You are a travel expert. Based on this trip to ${trip.destination}:
- Budget: ₹${trip.budget}
- Duration: ${trip.days} days
- Group: ${trip.groupSize} people
- Style: ${trip.travelStyle}

From these ${category.replace('-', ' ')}:
${places.map((p: any, i: number) => `${i + 1}. ${p.name} (Rating: ${p.rating || 'N/A'})`).join('\n')}

Recommend the TOP 5 and explain WHY each one fits this trip. Format your response as JSON:
{
  "recommendations": [
    {
      "place_id": "google_place_id",
      "name": "Place Name",
      "reason": "Brief explanation why this fits the trip"
    }
  ]
}`;

      try {
        // Use Gemini (via environment variable) or OpenAI for recommendations
        const geminiKey = process.env.Google_Gemini_Key || process.env.GEMINI_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        let aiText = '';

        if (geminiKey) {
          // Use Gemini
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          });
          const geminiData = await geminiRes.json();
          aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (openaiKey) {
          // Use OpenAI
          const openai = new OpenAI({ apiKey: openaiKey });
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
          });
          aiText = completion.choices[0]?.message?.content || '';
        } else {
          throw new Error('No AI service available');
        }

        const aiData = JSON.parse(aiText.replace(/```json\n?/g, '').replace(/```\n?/g, ''));

        // Enrich recommendations with photos and details
        const enriched = aiData.recommendations.slice(0, 5).map((rec: any) => {
          const placeData = places.find((p: any) => p.place_id === rec.place_id || p.name === rec.name);
          return {
            ...rec,
            address: placeData?.formatted_address || 'Address unavailable',
            rating: placeData?.rating,
            photos: placeData?.photos ? [
              `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${placeData.photos[0].photo_reference}&key=${key}`
            ] : [],
            location: placeData?.geometry?.location,
            priceLevel: placeData?.price_level
          };
        });

        res.json({ recommendations: enriched });
      } catch (aiError) {
        console.error("AI recommendation error:", aiError);
        // Fallback: just return top-rated places
        const fallback = places.slice(0, 5).map((place: any) => ({
          place_id: place.place_id,
          name: place.name,
          reason: `Highly rated ${category.replace('-', ' ')} in ${trip.destination}`,
          address: place.formatted_address,
          rating: place.rating,
          photos: place.photos ? [
            `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${key}`
          ] : [],
          location: place.geometry?.location,
          priceLevel: place.price_level
        }));
        res.json({ recommendations: fallback });
      }
    } catch (error) {
      console.error("Error generating AI recommendations:", error);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // Add discovered place to trip itinerary
  app.post('/api/v1/trips/:id/add-to-itinerary', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const { place, category } = req.body;

      const trip = await storage.getTrip(tripId, userId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      // Get current itinerary or create empty array - DEEP COPY to avoid mutation issues
      const currentItinerary = Array.isArray(trip.itinerary)
        ? JSON.parse(JSON.stringify(trip.itinerary))
        : [];

      console.log('[ADD TO ITINERARY] Current itinerary length:', currentItinerary.length);
      console.log('[ADD TO ITINERARY] First day activities:', currentItinerary[0]?.activities?.length || 0);

      // Determine the type based on category
      let activityType = 'sightseeing';
      if (category === 'restaurants') activityType = 'restaurant';
      else if (category === 'hotels') activityType = 'hotel';

      // Create new activity from the place
      const newActivity = {
        id: `discovered-${Date.now()}`,
        title: place.name,
        time: '10:00 AM', // Default time, user can edit later
        placeName: place.name,
        address: place.address || '',
        type: activityType,
        entryFee: 0,
        duration_minutes: 120,
        lat: place.location?.lat,
        lon: place.location?.lng,
        rating: place.rating,
        cost: 0
      };

      // Add to the first day's activities, or create first day if no itinerary exists
      if (currentItinerary.length === 0) {
        currentItinerary.push({
          day: 1,
          dayIndex: 0,
          date: new Date(),
          activities: [newActivity]
        });
      } else {
        // Add to the first day
        if (!currentItinerary[0].activities) {
          currentItinerary[0].activities = [];
        }
        currentItinerary[0].activities.push(newActivity);
      }

      console.log('[ADD TO ITINERARY] After adding - activities:', currentItinerary[0]?.activities?.length);

      // Update trip with new itinerary
      await storage.updateTrip(tripId, userId, { itinerary: currentItinerary } as any);

      res.json({ success: true, message: `${place.name} added to itinerary` });
    } catch (error) {
      console.error("Error adding to itinerary:", error);
      res.status(500).json({ message: "Failed to add to itinerary" });
    }
  });

  // Add manual activity to itinerary
  app.post('/api/v1/trips/:id/itinerary/activities', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const { dayIndex, activity } = req.body;

      const trip = await storage.getTrip(tripId, userId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const currentItinerary = Array.isArray(trip.itinerary)
        ? JSON.parse(JSON.stringify(trip.itinerary))
        : [];

      if (dayIndex < 0 || dayIndex >= currentItinerary.length) {
        return res.status(400).json({ message: "Invalid day index" });
      }

      // Add unique ID and required fields to activity
      const newActivity = {
        id: `activity-${Date.now()}`,
        time: activity.time || '09:00 AM',
        type: activity.type || 'sightseeing',
        cost: activity.cost || 0,
        duration_minutes: activity.duration_minutes || 60,
        ...activity
      };

      if (!currentItinerary[dayIndex].activities) {
        currentItinerary[dayIndex].activities = [];
      }
      currentItinerary[dayIndex].activities.push(newActivity);

      await storage.updateTrip(tripId, userId, { itinerary: currentItinerary } as any);

      res.json({ success: true, itinerary: currentItinerary });
    } catch (error) {
      console.error("Error adding activity:", error);
      res.status(500).json({ message: "Failed to add activity" });
    }
  });

  // Update activity in itinerary
  app.put('/api/v1/trips/:id/itinerary/activities/:activityId', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const activityId = req.params.activityId;
      const { dayIndex, updates } = req.body;

      const trip = await storage.getTrip(tripId, userId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const currentItinerary = Array.isArray(trip.itinerary)
        ? JSON.parse(JSON.stringify(trip.itinerary))
        : [];

      if (dayIndex < 0 || dayIndex >= currentItinerary.length) {
        return res.status(400).json({ message: "Invalid day index" });
      }

      const activities = currentItinerary[dayIndex].activities || [];
      const activityIndex = activities.findIndex((a: any) => a.id === activityId);

      if (activityIndex === -1) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // Merge updates with existing activity
      currentItinerary[dayIndex].activities[activityIndex] = {
        ...activities[activityIndex],
        ...updates
      };

      await storage.updateTrip(tripId, userId, { itinerary: currentItinerary } as any);

      res.json({ success: true, itinerary: currentItinerary });
    } catch (error) {
      console.error("Error updating activity:", error);
      res.status(500).json({ message: "Failed to update activity" });
    }
  });

  // Delete activity from itinerary
  app.delete('/api/v1/trips/:id/itinerary/activities/:activityId', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const activityId = req.params.activityId;
      const dayIndex = parseInt(req.query.dayIndex as string);

      const trip = await storage.getTrip(tripId, userId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const currentItinerary = Array.isArray(trip.itinerary)
        ? JSON.parse(JSON.stringify(trip.itinerary))
        : [];

      if (isNaN(dayIndex) || dayIndex < 0 || dayIndex >= currentItinerary.length) {
        return res.status(400).json({ message: "Invalid day index" });
      }

      const activities = currentItinerary[dayIndex].activities || [];
      const filteredActivities = activities.filter((a: any) => a.id !== activityId);

      if (filteredActivities.length === activities.length) {
        return res.status(404).json({ message: "Activity not found" });
      }

      currentItinerary[dayIndex].activities = filteredActivities;

      await storage.updateTrip(tripId, userId, { itinerary: currentItinerary } as any);

      res.json({ success: true, itinerary: currentItinerary });
    } catch (error) {
      console.error("Error deleting activity:", error);
      res.status(500).json({ message: "Failed to delete activity" });
    }
  });

  app.delete('/api/v1/trips/:id', async (req: any, res) => {
    try {
      const tripId = req.params.id;
      // Use unsafe delete as requested to bypass auth issues
      const deleted = await storage.deleteTripUnsafe(tripId);
      if (!deleted) {
        return res.status(404).json({ message: "Trip not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting trip:", error);
      res.status(500).json({ message: "Failed to delete trip" });
    }
  });


  // Journal routes
  app.get('/api/v1/journal', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const light = req.query.light === 'true';
      const limit = parseInt(req.query.limit as string) || (light ? 50 : 0);
      const page = parseInt(req.query.page as string) || 1;

      const entries = await storage.getUserJournalEntries(userId, {
        excludeHeavyFields: light,
        limit,
        page
      });

      if (light) {
        // Performance optimization: minimize payload for list view
        const lightEntries = entries.map(entry => {
          const doc = entry as any;
          return {
            ...doc,
            id: doc.id || doc._id?.toString(),
            // Only keep first photo (thumbnail) and truncate content
            photos: doc.photos && doc.photos.length > 0 ? [doc.photos[0]] : [],
            content: doc.content ? doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : '') : ''
          };
        });
        return res.json(lightEntries);
      }

      // Ensure full entries also have id field if lean
      const processedEntries = entries.map(entry => {
        const doc = entry as any;
        if (!doc.id && doc._id) doc.id = doc._id.toString();
        return doc;
      });

      res.json(processedEntries);
    } catch (error) {
      console.error("Error fetching journal entries:", error);
      res.status(500).json({ message: "Failed to fetch journal entries", detail: (error as Error).message });
    }
  });

  app.get('/api/v1/journal/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const entryId = req.params.id;
      const entry = await storage.getJournalEntry(entryId, userId);

      if (!entry) {
        return res.status(404).json({ message: "Journal entry not found" });
      }

      res.json(entry);
    } catch (error) {
      console.error("Error fetching journal entry:", error);
      res.status(500).json({ message: "Failed to fetch journal entry" });
    }
  });

  app.post('/api/v1/journal', isJwtAuthenticated, upload.array('photos', 5), async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      // Convert buffers to Base64 Data URIs
      const photos = req.files ? req.files.map((file: any) =>
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      ) : [];
      const entryData = insertJournalEntrySchema.parse({
        ...req.body,
        userId,
        photos: photos
      });
      const entry = await storage.createJournalEntry(entryData);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating journal entry:", error);
      res.status(400).json({ message: "Invalid journal entry data" });
    }
  });

  app.put('/api/v1/journal/:id', isJwtAuthenticated, upload.array('photos', 5), async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const entryId = req.params.id;

      const updates = insertJournalEntrySchema.partial().parse(req.body);

      // Convert new uploads to Base64
      const uploadedPhotos = req.files ? req.files.map((file: any) =>
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      ) : [];

      try {
        // Debug log size of uploads
        const totalSize = uploadedPhotos.reduce((acc: number, p: string) => acc + p.length, 0);
        fs.appendFileSync('server_debug.log', `DEBUG: Uploaded photo sizes: ${totalSize} bytes\n`);
      } catch (e) { console.error("Logging failed", e); }

      // Handle photos: New uploads + Kept existing photos
      // Client sends 'existingPhotos' as a JSON string of URL array
      let keptPhotos: string[] = [];
      if (req.body.existingPhotos) {
        try {
          const parsed = JSON.parse(req.body.existingPhotos);
          if (Array.isArray(parsed)) keptPhotos = parsed;
        } catch (e) {
          // Maybe sent as plain strings if using simple append? Let's treat as single if logic fails or just array if repeated keys (but multer specific invalidation). 
          // Better to stick to JSON parsing for safety if client sends it that way.
          // Fallback for non-JSON format (simple FormData append)
          if (Array.isArray(req.body.existingPhotos)) keptPhotos = req.body.existingPhotos;
          else keptPhotos = [req.body.existingPhotos];
        }
      } else {
        // Fallback: If no existingPhotos param, preserve current DB photos (standard append behavior)
        const existingEntry = await storage.getJournalEntry(entryId, userId);
        keptPhotos = existingEntry?.photos || [];
      }

      updates.photos = [...uploadedPhotos, ...keptPhotos];
      fs.appendFileSync('server_debug.log', `DEBUG: Updates object before DB call: ${JSON.stringify(updates)}\n`);

      const entry = await storage.updateJournalEntry(entryId, userId, updates);
      if (!entry) {
        return res.status(404).json({ message: "Journal entry not found" });
      }
      res.json(entry);
    } catch (error) {
      console.error("Error updating journal entry:", error);
      res.status(400).json({ message: "Invalid journal entry data" });
    }
  });

  app.delete('/api/v1/journal/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const entryId = req.params.id;
      const deleted = await storage.deleteJournalEntry(entryId, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Journal entry not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting journal entry:", error);
      res.status(500).json({ message: "Failed to delete journal entry" });
    }
  });

  // Packing list routes
  app.get('/api/v1/packing-lists', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const lists = await storage.getUserPackingLists(userId);
      res.json(lists);
    } catch (error) {
      console.error("Error fetching packing lists:", error);
      res.status(500).json({ message: "Failed to fetch packing lists" });
    }
  });

  app.post('/api/v1/packing-lists', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const listData = insertPackingListSchema.parse({ ...req.body, userId });
      const list = await storage.createPackingList(listData);
      res.status(201).json(list);
    } catch (error) {
      console.error("Error creating packing list:", error);
      res.status(400).json({ message: "Invalid packing list data" });
    }
  });

  app.put('/api/v1/packing-lists/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const listId = req.params.id;
      const updates = insertPackingListSchema.partial().parse(req.body);
      const list = await storage.updatePackingList(listId, userId, updates);
      if (!list) {
        return res.status(404).json({ message: "Packing list not found" });
      }
      res.json(list);
    } catch (error) {
      console.error("Error updating packing list:", error);
      res.status(400).json({ message: "Invalid packing list data" });
    }
  });

  app.delete('/api/v1/packing-lists/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const listId = req.params.id;
      const deleted = await storage.deletePackingList(listId, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Packing list not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting packing list:", error);
      res.status(500).json({ message: "Failed to delete packing list" });
    }
  });

  // API versioning
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 requests per windowMs for external APIs
    message: "Too many API requests, please try again later.",
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req: any) => {
      const userId = req.user?.claims?.sub || req.user?.id;
      return userId || ipKeyGenerator(req);
    },
    message: "Too many requests, please slow down.",
  });
  const aiLimit = devMode ? ((req: any, _res: any, next: any) => next()) : aiLimiter;

  const ai = new AiUtilitiesService();
  const inflightPlans = new Map<string, Promise<string>>();

  // List Duplication Route
  app.post("/api/v1/packing-lists/:id/duplicate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const newList = await storage.duplicatePackingList(req.params.id, user.id);
      if (!newList) return res.status(404).json({ message: "List not found" });
      res.json(newList);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Template Routes
  app.post("/api/v1/packing-lists/templates", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const template = await storage.createPackingListTemplate({ ...req.body, userId: user.id });
      res.status(201).json(template);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/packing-lists/templates", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const templates = await storage.getUserPackingListTemplates(user.id);
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/v1/packing-lists/templates/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      const user = req.user as any;
      const success = await storage.deletePackingListTemplate(req.params.id, user.id);
      if (!success) return res.status(404).json({ message: "Template not found" });
      res.json({ message: "Deleted successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let to: NodeJS.Timeout | null = null;
    return await Promise.race([
      p.finally(() => { if (to) clearTimeout(to); }),
      new Promise<T>((_, reject) => {
        to = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
      }) as Promise<T>,
    ]) as T;
  }

  async function generateMarkdownGemini(prompt: string, key: string, timeoutMs: number): Promise<string> {
    if (!key) throw new Error('no_key');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
          signal: controller.signal,
        }
      );
      const j = await r.json();
      const parts = j?.candidates?.[0]?.content?.parts || [];
      const markdown = parts.map((p: any) => String(p.text || '')).filter(Boolean).join('\n');
      if (!markdown) throw new Error('empty');
      return markdown;
    } finally {
      clearTimeout(timer);
    }
  }

  async function generateMarkdownOpenAI(prompt: string, timeoutMs: number): Promise<string> {
    const openaiKey = process.env.OPENAI_API_KEY || '';
    if (!openaiKey) throw new Error('no_key');
    const client = new OpenAI({ apiKey: openaiKey });
    const completion = client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Return a detailed, practical trip plan in Markdown only. No code fences. Sections: Overview, Daily Itinerary (by day with times), Accommodation suggestions (2–3 per budget), Food recommendations, Local transport tips, Budget breakdown table, Safety and etiquette tips, Packing checklist, Final reminders.' },
        { role: 'user', content: prompt },
      ],
    });
    const res = await withTimeout(completion as unknown as Promise<any>, timeoutMs, 'openai');
    const content = res?.choices?.[0]?.message?.content?.trim() || '';
    if (!content) throw new Error('empty');
    return content;
  }

  // Legacy weather route (kept for backward compatibility)
  app.get('/api/v1/weather/:location', apiLimiter, async (req, res) => {
    try {
      const location = req.params.location;
      const key = process.env.GOOGLE_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      if (key) {
        let currentJson: any;
        let coord: { lat: number; lon: number } | null = null;
        const currentRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=metric&appid=${key}`);
        currentJson = await currentRes.json();
        if (!currentRes.ok) {
          const geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${key}`);
          const geoJson = await geoRes.json();
          if (Array.isArray(geoJson) && geoJson.length > 0) {
            coord = { lat: geoJson[0].lat, lon: geoJson[0].lon };
            const currentByCoordRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${coord.lat}&lon=${coord.lon}&units=metric&appid=${key}`);
            currentJson = await currentByCoordRes.json();
            if (!currentByCoordRes.ok) {
              return res.status(currentByCoordRes.status).json({ message: currentJson?.message || 'Weather fetch failed' });
            }
          } else {
            return res.status(currentRes.status).json({ message: currentJson?.message || 'Weather fetch failed' });
          }
        } else {
          coord = currentJson?.coord ? { lat: currentJson.coord.lat, lon: currentJson.coord.lon } : null;
        }
        let forecastJson: any;
        if (coord) {
          const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${coord.lat}&lon=${coord.lon}&units=metric&appid=${key}`);
          forecastJson = await forecastRes.json();
        } else {
          const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&units=metric&appid=${key}`);
          forecastJson = await forecastRes.json();
        }
        const iconMap: Record<string, string> = {
          Clear: 'fas fa-sun',
          Clouds: 'fas fa-cloud',
          Rain: 'fas fa-cloud-rain',
          Drizzle: 'fas fa-cloud-rain',
          Thunderstorm: 'fas fa-bolt',
          Snow: 'fas fa-snowflake',
          Mist: 'fas fa-smog',
          Smoke: 'fas fa-smog',
          Haze: 'fas fa-smog',
          Dust: 'fas fa-smog',
          Fog: 'fas fa-smog',
          Sand: 'fas fa-smog',
          Ash: 'fas fa-smog',
          Squall: 'fas fa-wind',
          Tornado: 'fas fa-wind'
        };
        const today = { day: 'Today', high: Math.round(currentJson.main.temp_max), low: Math.round(currentJson.main.temp_min), condition: currentJson.weather?.[0]?.main || 'Clear', icon: iconMap[currentJson.weather?.[0]?.main] || 'fas fa-sun' };
        const byDate: Record<string, { high: number; low: number; main: string }> = {};
        const list = Array.isArray(forecastJson.list) ? forecastJson.list : [];
        for (const item of list) {
          const d = item.dt_txt?.slice(0, 10) || '';
          const tMax = item.main?.temp_max;
          const tMin = item.main?.temp_min;
          const main = item.weather?.[0]?.main || 'Clear';
          if (!byDate[d]) {
            byDate[d] = { high: tMax, low: tMin, main } as any;
          } else {
            byDate[d].high = Math.max(byDate[d].high, tMax);
            byDate[d].low = Math.min(byDate[d].low, tMin);
          }
        }
        const days: Array<{ day: string; high: number; low: number; condition: string; icon: string }> = [today];
        const now = new Date();
        for (let i = 1; i <= 6; i++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
          const keyDate = d.toISOString().slice(0, 10);
          const data = byDate[keyDate];
          const label = i === 1 ? 'Tomorrow' : `Day ${i + 1}`;
          if (data) {
            days.push({ day: label, high: Math.round(data.high), low: Math.round(data.low), condition: data.main, icon: iconMap[data.main] || 'fas fa-cloud' });
          }
        }
        return res.json({ location, current: { temperature: Math.round(currentJson.main.temp), condition: today.condition, humidity: currentJson.main.humidity, windSpeed: Math.round(currentJson.wind.speed), icon: today.icon }, forecast: days });
      }
      if (openaiKey) {
        try {
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: 'Generate concise travel weather in metric units. Return strictly JSON.' },
                { role: 'user', content: `Location: ${location}. Provide: { location, current: { temperature:number, condition:string, humidity:number, windSpeed:number }, forecast: [{ day:string, high:number, low:number, condition:string }], summary:string }` },
              ],
              temperature: 0,
            }),
          });
          const j = await r.json();
          let content = j.choices?.[0]?.message?.content || '';
          let s = content.trim();
          if (s.startsWith('```')) {
            s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
          }
          const firstBrace = s.indexOf('{');
          const lastBrace = s.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            s = s.slice(firstBrace, lastBrace + 1);
          }
          let ai;
          try {
            ai = JSON.parse(s);
          } catch {
            ai = null;
          }
          const iconMap: Record<string, string> = {
            Clear: 'fas fa-sun',
            Sunny: 'fas fa-sun',
            Clouds: 'fas fa-cloud',
            Cloudy: 'fas fa-cloud',
            Rain: 'fas fa-cloud-rain',
            Drizzle: 'fas fa-cloud-rain',
            Thunderstorm: 'fas fa-bolt',
            Snow: 'fas fa-snowflake',
            Mist: 'fas fa-smog',
            Fog: 'fas fa-smog',
            Wind: 'fas fa-wind',
          };
          if (ai && ai.current && Array.isArray(ai.forecast)) {
            const currentIcon = iconMap[ai.current.condition] || 'fas fa-cloud';
            const forecast = ai.forecast.slice(0, 7).map((d: any, idx: number) => ({
              day: d.day || (idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : `Day ${idx + 1}`),
              high: Math.round(d.high ?? ai.current.temperature),
              low: Math.round(d.low ?? Math.max(0, (ai.current.temperature ?? 20) - 5)),
              condition: d.condition || 'Clouds',
              icon: iconMap[d.condition] || 'fas fa-cloud',
            }));
            return res.json({ location, current: { temperature: Math.round(ai.current.temperature ?? 22), condition: ai.current.condition || 'Clouds', humidity: Math.round(ai.current.humidity ?? 60), windSpeed: Math.round(ai.current.windSpeed ?? 10), icon: currentIcon }, forecast, summary: ai.summary || `Weather outlook for ${location}` });
          }
        } catch { }
      }
      const mockWeatherData = {
        location,
        current: {
          temperature: 24,
          condition: "Partly Cloudy",
          humidity: 65,
          windSpeed: 12,
          icon: "fas fa-cloud-sun"
        },
        forecast: [
          { day: "Today", high: 26, low: 18, condition: "Partly Cloudy", icon: "fas fa-cloud-sun" },
          { day: "Tomorrow", high: 28, low: 20, condition: "Sunny", icon: "fas fa-sun" },
          { day: "Day 3", high: 23, low: 16, condition: "Rainy", icon: "fas fa-cloud-rain" },
          { day: "Day 4", high: 25, low: 19, condition: "Cloudy", icon: "fas fa-cloud" },
          { day: "Day 5", high: 27, low: 21, condition: "Sunny", icon: "fas fa-sun" },
          { day: "Day 6", high: 24, low: 17, condition: "Partly Cloudy", icon: "fas fa-cloud-sun" },
          { day: "Day 7", high: 22, low: 15, condition: "Rainy", icon: "fas fa-cloud-rain" },
        ]
      };
      res.json(mockWeatherData);
    } catch (error) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ message: "Failed to fetch weather data" });
    }
  });

  // Currency conversion API
  app.get('/api/v1/currency/convert/:from/:to/:amount', apiLimiter, async (req, res) => {
    try {
      const { from, to, amount } = req.params;

      // Mock exchange rates - in production, use a real API like Fixer.io or ExchangeRate-API
      const exchangeRates: Record<string, Record<string, number>> = {
        USD: { EUR: 0.85, GBP: 0.73, JPY: 110, INR: 83, CAD: 1.25, AUD: 1.35, CHF: 0.92, CNY: 6.45 },
        EUR: { USD: 1.18, GBP: 0.86, JPY: 129, INR: 98, CAD: 1.47, AUD: 1.59, CHF: 1.08, CNY: 7.59 },
        GBP: { USD: 1.37, EUR: 1.16, JPY: 151, INR: 114, CAD: 1.71, AUD: 1.85, CHF: 1.26, CNY: 8.83 },
        INR: { USD: 0.012, EUR: 0.010, GBP: 0.0088, JPY: 1.32, CAD: 0.015, AUD: 0.016, CHF: 0.011, CNY: 0.077 },
      };

      const rate = exchangeRates[from.toUpperCase()]?.[to.toUpperCase()] || 1;
      const convertedAmount = parseFloat(amount) * rate;

      res.json({
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        originalAmount: parseFloat(amount),
        convertedAmount: Math.round(convertedAmount * 100) / 100,
        rate
      });
    } catch (error) {
      console.error("Error converting currency:", error);
      res.status(500).json({ message: "Failed to convert currency" });
    }
  });

  // Legacy translate route (kept for backward compatibility)
  app.get('/api/v1/translate/:from/:to/:text', apiLimiter, async (req, res) => {
    try {
      const { from, to, text } = req.params as { from: string; to: string; text: string };
      const url = process.env.TRANSLATE_API_URL;
      const key = process.env.TRANSLATE_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      if (url) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (key) headers['Authorization'] = `Bearer ${key}`;
        const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ q: text, source: from, target: to, format: 'text' }) });
        const j = await r.json();
        const translatedText = j.translatedText || j.data?.translations?.[0]?.translatedText || '';
        return res.json({ originalText: text, translatedText: translatedText || text, from, to });
      }
      if (openaiKey) {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Translate the user text exactly without adding commentary.' },
              { role: 'user', content: `Translate from ${from} to ${to}: ${text}` },
            ],
            temperature: 0,
          }),
        });
        const j = await r.json();
        const translatedText = j.choices?.[0]?.message?.content || text;
        return res.json({ originalText: text, translatedText, from, to });
      }
      const map: Record<string, (s: string) => string> = {
        en: (s) => s,
        es: (s) => `«${s}»`,
        fr: (s) => `«${s}»`,
        de: (s) => `„${s}“`,
        it: (s) => `«${s}»`,
        pt: (s) => `«${s}»`,
        ru: (s) => s,
        ja: (s) => s,
        ko: (s) => s,
        zh: (s) => s,
      };
      const transform = map[to] || ((s: string) => s);
      res.json({ originalText: text, translatedText: transform(text), from, to });
    } catch (error) {
      console.error("Error translating text:", error);
      res.status(500).json({ message: "Failed to translate" });
    }
  });

  // Legacy emergency route (kept for backward compatibility)
  app.get('/api/v1/emergency/:location', apiLimiter, async (req, res) => {
    try {
      const location = req.params.location;
      // Prioritize PLACES key as requested by user
      const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
      const types = ['hospital', 'police', 'embassy', 'pharmacy'];
      const results: Array<{ id: string; name: string; type: string; address: string; phone: string; distance: string; latitude: number; longitude: number }> = [];
      if (key) {
        for (const t of types) {
          const q = `${t} near ${location}`;
          const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${key}`);
          const j = await r.json();
          const first = Array.isArray(j.results) ? j.results[0] : undefined;
          if (first) {
            results.push({ id: first.place_id || `${t}-${results.length}`, name: first.name || t, type: t, address: first.formatted_address || '', phone: '+1 (555) 000-0000', distance: '—', latitude: first.geometry?.location?.lat || 0, longitude: first.geometry?.location?.lng || 0 });
          }
        }
      }
      if (!results.length) {
        for (const t of types) {
          // Respect Nominatim rate limits (Max 1 req/sec)
          if (types.indexOf(t) > 0) await new Promise(resolve => setTimeout(resolve, 1200));

          const q = `${t} near ${location}`;
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`, {
            headers: {
              'User-Agent': 'TripMate/1.0 (+https://example.com)',
              'Accept-Language': 'en'
            }
          });
          if (r.status === 429) {
            console.warn(`Nominatim rate limit hit for ${t}`);
            continue;
          }
          const j = await r.json().catch(() => []);
          const first = Array.isArray(j) ? j[0] : undefined;
          if (first) {
            results.push({ id: `${t}-${results.length}`, name: first.display_name?.split(',')[0] || t, type: t, address: first.display_name || '', phone: '+1 (555) 000-0000', distance: '—', latitude: parseFloat(first.lat), longitude: parseFloat(first.lon) });
          }
        }
      }
      let detectedCountry = 'EU'; // Default
      if (results.length > 0) {
        const addr = results[0].address.toLowerCase();
        if (addr.includes('india') || addr.includes('delhi') || addr.includes('mumbai')) detectedCountry = 'IN';
        else if (addr.includes('usa') || addr.includes('united states') || addr.includes('ny') || addr.includes('ca')) detectedCountry = 'US';
        else if (addr.includes('uk') || addr.includes('united kingdom') || addr.includes('london')) detectedCountry = 'UK';
      }

      const sosNumbers = {
        police: mapEmergencyNumber(detectedCountry, 'police'),
        medical: mapEmergencyNumber(detectedCountry, 'medical'),
        fire: mapEmergencyNumber(detectedCountry, 'fire'),
        common: detectedCountry === 'US' ? '911' : (detectedCountry === 'IN' ? '112' : '112')
      };

      res.json({ services: results, countryCode: detectedCountry, sosNumbers });
    } catch (error) {
      console.error('Error fetching emergency services:', error);
      res.status(500).json({ message: 'Failed to fetch emergency services' });
    }
  });

  // New AI-only utility endpoints
  // New AI-only utility endpoints
  app.post('/api/v1/translate', optionalAuth, aiLimiter, async (req: any, res) => {
    try {
      const { text = '', sourceLang = 'en', targetLang = 'en' } = req.body || {};

      // Use specific Translate key if available, otherwise fallback to general Google keys (Places or generic)
      const key = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

      if (!key) {
        throw new Error("Missing Google API Key for translation");
      }

      const url = `https://translation.googleapis.com/language/translate/v2?key=${key}`;

      // If sourceLang is 'auto', we omit the source parameter to let Google detect it
      const apiBody: any = {
        q: text,
        target: targetLang,
        format: 'text'
      };
      if (sourceLang !== 'auto') {
        apiBody.source = sourceLang;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiBody)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Google Translate API error:', data);
        return res.status(response.status).json({ message: 'Translation failed', details: data });
      }

      // Google API response structure: { data: { translations: [ { translatedText: "..." } ] } }
      const translatedText = data.data?.translations?.[0]?.translatedText || '';

      // Generate pronunciation (transliteration)
      let pronunciation = '';
      try {
        const { transliterate } = await import('transliteration');
        pronunciation = transliterate(translatedText);
      } catch (tError) {
        console.warn('Transliteration failed:', tError);
      }

      // Determine 'Meaning' in English
      let meaning = '';
      if (sourceLang === 'en') {
        meaning = text;
      } else if (targetLang === 'en') {
        meaning = translatedText;
      } else {
        // Double translation: Translate Source -> English to get meaning
        // If source is 'auto', we must translate to English to be sure
        try {
          const meaningBody: any = { q: text, target: 'en', format: 'text' };
          if (sourceLang !== 'auto') meaningBody.source = sourceLang;

          const meaningRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(meaningBody)
          });
          const meaningData = await meaningRes.json();
          meaning = meaningData.data?.translations?.[0]?.translatedText || '';
        } catch (mError) {
          console.warn('Meaning fetch failed:', mError);
        }
      }

      return res.json({ translatedText, pronunciation, meaning });

    } catch (error) {
      console.error('Translation error:', error);
      res.status(500).json({ translatedText: '', error: 'Internal server error' });
    }
  });

  // Client log ingestion (info)
  app.post('/api/v1/logs/info', optionalAuth, async (req: any, res) => {
    try {
      const { event = '', payload = {}, ts = Date.now() } = req.body || {};
      const logs: Array<{ event: string; payload: any; ts: number }> = (req.app.locals as any).logsInfo || [];
      logs.push({ event: String(event), payload, ts: Number(ts) });
      (req.app.locals as any).logsInfo = logs;
      res.status(204).send();
    } catch (error) {
      console.error('logs_info_error', error);
      res.status(500).json({ message: 'log_ingest_failed' });
    }
  });

  // Client log ingestion (error)
  app.post('/api/v1/logs/error', optionalAuth, async (req: any, res) => {
    try {
      const { event = '', payload = {}, ts = Date.now() } = req.body || {};
      const logs: Array<{ event: string; payload: any; ts: number }> = (req.app.locals as any).logsError || [];
      logs.push({ event: String(event), payload, ts: Number(ts) });
      (req.app.locals as any).logsError = logs;
      res.status(204).send();
    } catch (error) {
      console.error('logs_error_error', error);
      res.status(500).json({ message: 'log_ingest_failed' });
    }
  });

  app.get('/api/v1/weather', optionalAuth, aiLimiter, async (req: any, res) => {
    try {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      const cityQ = String(req.query.city || req.query.location || '').trim();
      const units = String(req.query.units || 'metric');
      const key = process.env.GOOGLE_PLACES_API_KEY;

      const iconMap: Record<string, string> = {
        CLEAR: 'fas fa-sun',
        PARTLY_CLOUDY: 'fas fa-cloud-sun',
        CLOUDY: 'fas fa-cloud',
        RAIN: 'fas fa-cloud-rain',
        SCATTERED_SHOWERS: 'fas fa-cloud-rain',
        DRIZZLE: 'fas fa-cloud-rain',
        THUNDERSTORM: 'fas fa-bolt',
        SNOW: 'fas fa-snowflake',
        MIST: 'fas fa-smog',
        FOG: 'fas fa-smog',
        WIND: 'fas fa-wind',
        Clear: 'fas fa-sun',
        Clouds: 'fas fa-cloud',
        Rain: 'fas fa-cloud-rain',
        Drizzle: 'fas fa-cloud-rain',
        Thunderstorm: 'fas fa-bolt',
        Snow: 'fas fa-snowflake',
        Mist: 'fas fa-smog',
        Smoke: 'fas fa-smog',
        Haze: 'fas fa-smog',
        Dust: 'fas fa-smog',
        Fog: 'fas fa-smog',
        Sand: 'fas fa-smog',
        Ash: 'fas fa-smog',
        Squall: 'fas fa-wind',
        Tornado: 'fas fa-wind',
      };

      const getWeatherData = async (latNum: number, lonNum: number) => {
        // 1. Try Google Weather API first (if key exists)
        if (key) {
          try {
            const currentUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${key}&location.latitude=${latNum}&location.longitude=${lonNum}`;
            const currentRes = await fetch(currentUrl);

            if (currentRes.ok) {
              const currentData = await currentRes.json();
              const forecastUrl = `https://weather.googleapis.com/v1/forecast/days:lookup?key=${key}&location.latitude=${latNum}&location.longitude=${lonNum}&days=7`;
              const forecastRes = await fetch(forecastUrl);

              if (forecastRes.ok) {
                const forecastData = await forecastRes.json();

                // Map Google Data (existing logic)
                const tempCelsius = currentData.temperature?.degrees ?? 22;
                const temperature = units === 'metric' ? Math.round(tempCelsius) : Math.round(tempCelsius * 9 / 5 + 32);
                const condition = currentData.weatherCondition?.description?.text || 'Clear';
                const conditionType = currentData.weatherCondition?.type || 'CLEAR';

                const current = {
                  temperature,
                  tempMin: temperature - 5,
                  tempMax: temperature,
                  condition,
                  humidity: currentData.relativeHumidity ?? 60,
                  windSpeed: Math.round(currentData.wind?.speed?.value ?? 10),
                  windDeg: currentData.wind?.direction?.degrees ?? 0,
                  windDir: currentData.wind?.direction?.cardinal || 'N',
                  icon: iconMap[conditionType] || 'fas fa-cloud',
                };

                const forecast = (forecastData.forecastDays || []).slice(0, 7).map((day: any, i: number) => {
                  const maxTemp = day.maxTemperature?.degrees ?? temperature;
                  const minTemp = day.minTemperature?.degrees ?? (temperature - 5);
                  const dayCondition = day.daytimeForecast?.weatherCondition?.description?.text || 'Clear';
                  const dayType = day.daytimeForecast?.weatherCondition?.type || 'CLEAR';
                  return {
                    day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
                    high: units === 'metric' ? Math.round(maxTemp) : Math.round(maxTemp * 9 / 5 + 32),
                    low: units === 'metric' ? Math.round(minTemp) : Math.round(minTemp * 9 / 5 + 32),
                    condition: dayCondition,
                    icon: iconMap[dayType] || 'fas fa-cloud',
                  };
                });

                if (forecast.length > 0) {
                  current.tempMax = forecast[0].high;
                  current.tempMin = forecast[0].low;
                }

                const recommendations: string[] = [];
                if (current.temperature >= 30) recommendations.push('Stay hydrated');
                if (condition.toLowerCase().includes('rain') || condition.toLowerCase().includes('shower')) recommendations.push('Carry a raincoat');
                recommendations.push('Use sunscreen during midday');

                return {
                  current,
                  forecast,
                  hourly: [],
                  alerts: [],
                  recommendations,
                  source: 'google-weather',
                };
              }
            }
            console.warn('[weather:google] Failed or unauthorized, trying Open-Meteo fallback');
          } catch (error) {
            console.error('[weather:google] Exception:', error);
          }
        }

        // 2. Open-Meteo Fallback
        try {
          console.log('[weather:fallback] Fetching from Open-Meteo for', latNum, lonNum);
          const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lonNum}&longitude=${lonNum}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
          // Correction: latitude should be latNum. The URL above has error, fixing it:
          const realOmUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;

          const omRes = await fetch(realOmUrl);
          if (!omRes.ok) throw new Error(`Open-Meteo status: ${omRes.status}`);

          const omData = await omRes.json();

          const mapWmo = (code: number) => {
            if (code === 0) return { desc: 'Clear', icon: 'fas fa-sun' };
            if (code <= 3) return { desc: 'Partly Cloudy', icon: 'fas fa-cloud-sun' };
            if (code <= 48) return { desc: 'Fog', icon: 'fas fa-smog' };
            if (code <= 55) return { desc: 'Drizzle', icon: 'fas fa-cloud-rain' };
            if (code <= 67) return { desc: 'Rain', icon: 'fas fa-cloud-showers-heavy' };
            if (code <= 77) return { desc: 'Snow', icon: 'fas fa-snowflake' };
            if (code <= 82) return { desc: 'Rain Showers', icon: 'fas fa-cloud-rain' };
            if (code <= 86) return { desc: 'Snow Showers', icon: 'fas fa-snowflake' };
            return { desc: 'Thunderstorm', icon: 'fas fa-bolt' };
          };

          const currentWmo = mapWmo(omData.current.weather_code);
          const tempC = omData.current.temperature_2m;
          const temp = units === 'metric' ? Math.round(tempC) : Math.round(tempC * 9 / 5 + 32);

          const current = {
            temperature: temp,
            tempMin: temp - 5,
            tempMax: temp + 5,
            condition: currentWmo.desc,
            humidity: omData.current.relative_humidity_2m || 60,
            windSpeed: Math.round(omData.current.wind_speed_10m || 0),
            windDeg: omData.current.wind_direction_10m || 0,
            windDir: 'N',
            icon: currentWmo.icon
          };

          const forecast = (omData.daily.time || []).slice(0, 7).map((t: string, i: number) => {
            const maxC = omData.daily.temperature_2m_max[i];
            const minC = omData.daily.temperature_2m_min[i];
            const wmo = mapWmo(omData.daily.weather_code[i]);

            return {
              day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
              high: units === 'metric' ? Math.round(maxC) : Math.round(maxC * 9 / 5 + 32),
              low: units === 'metric' ? Math.round(minC) : Math.round(minC * 9 / 5 + 32),
              condition: wmo.desc,
              icon: wmo.icon
            };
          });

          if (forecast.length > 0) {
            current.tempMax = forecast[0].high;
            current.tempMin = forecast[0].low;
          }

          const recommendations: string[] = [];
          if (current.temperature >= 30) recommendations.push('Stay hydrated');
          if (current.condition.toLowerCase().includes('rain')) recommendations.push('Carry a raincoat');

          return {
            current,
            forecast,
            hourly: [],
            alerts: [],
            recommendations,
            source: 'open-meteo',
          };

        } catch (e) {
          console.error('[weather:fallback] Open-Meteo failed:', e);
          return null;
        }
      };

      if (!key) {
        const weatherData = await getWeatherData(lat, lon);
        if (weatherData) return res.json(weatherData);

        return res.status(503).json({
          current: {},
          forecast: [],
          recommendations: [],
          alerts: [],
          error: 'Weather service unavailable'
        });
      }

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log('[weather:req]', { lat, lon, cityQ, units });
        const weatherData = await getWeatherData(lat, lon);
        if (weatherData) return res.json(weatherData);

        // Fallback mock
        const now = new Date();
        const month = now.getMonth();
        const baseTemp = [20, 22, 26, 30, 32, 33, 32, 31, 30, 28, 24, 21][month] || 28;
        return res.status(200).json({
          current: {
            temperature: Math.round(baseTemp),
            humidity: 60,
            windSpeed: 10,
            condition: baseTemp >= 30 ? 'Sunny' : 'Cloudy',
            icon: 'fas fa-cloud-sun'
          },
          forecast: [],
          recommendations: [],
          alerts: [],
          source: 'fallback-route'
        });
      }

      if (!cityQ) {
        return res.status(400).json({ current: {}, forecast: [], recommendations: [], alerts: [] });
      }

      if (key) {
        try {
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cityQ)}&key=${key}`;
          const geocodeRes = await fetch(geocodeUrl);

          if (geocodeRes.ok) {
            const geocodeData = await geocodeRes.json();
            if (geocodeData.status === 'OK' && geocodeData.results && geocodeData.results.length > 0) {
              const location = geocodeData.results[0].geometry.location;
              console.log('[weather:geocode:google:success]', { cityQ, lat: location.lat, lon: location.lng });
              const weatherData = await getWeatherData(location.lat, location.lng);
              if (weatherData) return res.json(weatherData);
            }
          }
        } catch (e) {
          console.error('[weather:geocode:google:error]', String(e));
        }
      }

      // 2. Fallback to Nominatim
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(cityQ)}`;
        const nomRes = await fetch(nomUrl, { headers: { 'User-Agent': 'TripMate/1.0' } });
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (Array.isArray(nomData) && nomData.length > 0) {
            const lat = parseFloat(nomData[0].lat);
            const lon = parseFloat(nomData[0].lon);
            console.log('[weather:geocode:nominatim:success]', { cityQ, lat, lon });
            const weatherData = await getWeatherData(lat, lon);
            if (weatherData) return res.json(weatherData);
          }
        }
      } catch (e) {
        console.error('[weather:geocode:nominatim:error]', String(e));
      }

      const result = await ai.weather(cityQ);
      console.log('[weather:ai]', { cityQ, units });
      res.json({ ...result, alerts: [] });

    } catch (error) {
      console.error('weather route error:', error);
      res.status(500).json({ message: 'Weather error' });
    }
  });



  app.get('/api/v1/currency', isJwtAuthenticated, aiLimiter, async (req: any, res) => {
    try {
      const amount = Number(req.query.amount || 0);
      const from = String(req.query.from || 'USD');
      const to = String(req.query.to || 'EUR');
      const today = new Date().toISOString().slice(0, 10);
      const result = await ai.currency(amount, from, to, today);
      res.json(result);
    } catch (error) {
      console.error('AI currency error:', error);
      res.status(500).json({ rate: 0, convertedAmount: 0, currencyName: '', disclaimer: 'Unavailable' });
    }
  });


  app.get('/api/v1/packing-lists', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const lists = await storage.getUserPackingLists(userId);
      res.json(lists);
    } catch (error) {
      console.error('Get packing lists error:', error);
      res.status(500).json({ message: 'Failed to fetch packing lists' });
    }
  });

  app.post('/api/v1/packing-lists', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const data = insertPackingListSchema.parse({ ...req.body, userId });
      const list = await storage.createPackingList(data);
      res.status(201).json(list);
    } catch (error) {
      console.error('Create packing list error:', error);
      res.status(400).json({ message: 'Invalid input' });
    }
  });

  app.put('/api/v1/packing-lists/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const updated = await storage.updatePackingList(req.params.id, userId, req.body);
      if (!updated) return res.status(404).json({ message: 'List not found' });
      res.json(updated);
    } catch (error) {
      console.error('Update packing list error:', error);
      res.status(500).json({ message: 'Failed to update packing list' });
    }
  });

  app.delete('/api/v1/packing-lists/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const success = await storage.deletePackingList(req.params.id, userId);
      if (!success) return res.status(404).json({ message: 'List not found' });
      res.sendStatus(204);
    } catch (error) {
      console.error('Delete packing list error:', error);
      res.status(500).json({ message: 'Failed to delete packing list' });
    }
  });

  app.get('/api/v1/emergency', optionalAuth, aiLimiter, async (req: any, res) => {
    try {
      const locRaw = String(req.query.location || req.query.city || '').trim();
      if (!locRaw) return res.status(400).json([]);

      let lat = 0, lon = 0;
      const coordMatch = locRaw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);

      // 1. Resolve Coordinates
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lon = parseFloat(coordMatch[2]);
      } else {
        let found = false;
        const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

        // Try Google Geocoding first
        if (key) {
          try {
            const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locRaw)}&key=${key}`;
            const gRes = await fetch(gUrl);
            if (gRes.ok) {
              const gData = await gRes.json();
              if (gData.status === 'OK' && gData.results?.length > 0) {
                const loc = gData.results[0].geometry.location;
                lat = loc.lat;
                lon = loc.lng;
                found = true;
              }
            }
          } catch (e) {
            console.error('Emergency Google geocode error:', e);
          }
        }

        // Fallback to Nominatim Geocoding
        if (!found) {
          try {
            const nUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(locRaw)}`;
            const nRes = await fetch(nUrl, { headers: { 'User-Agent': 'TripMate/1.0' } });
            if (nRes.ok) {
              const nData = await nRes.json();
              if (Array.isArray(nData) && nData.length > 0) {
                lat = parseFloat(nData[0].lat);
                lon = parseFloat(nData[0].lon);
                found = true;
              }
            }
          } catch (e) {
            console.error('Emergency Nominatim geocode error:', e);
          }
        }

        // If still not found, try AI fallback directly
        if (!found) {
          const byText = await ai.emergency(locRaw);
          return res.json(byText);
        }
      }

      // 2. Determine Country for SOS numbers
      let countryCode = 'xx';
      let countryName = '';
      try {
        // Fast reverse geo for country code (needed for SOS numbers)
        // Try simple coordinate lookup if possible, or basic reverse geo
        // We use Nominatim here as it's free and sufficient for Country Code
        const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3`,
          { headers: { 'User-Agent': 'TripMate/1.0', 'Accept-Language': 'en' } });
        const j = await rev.json();
        countryCode = String(j?.address?.country_code || 'xx').toUpperCase();
        countryName = String(j?.address?.country || '');
      } catch { }

      // 3. Fetch Services (Hospital, Police, etc.)
      const types = ['hospital', 'police', 'embassy', 'pharmacy'] as const;
      const results: Array<{ id: string; name: string; type: string; address: string; phone: string; distance: string; latitude: number; longitude: number }> = [];

      const googleKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

      if (googleKey) {
        // --- GOOGLE PLACES STRATEGY (Parallel & Accurate) ---
        await Promise.all(types.map(async (type) => {
          try {
            // Mapping internal types to Google Place types
            // embassy -> embassy (supported)
            // pharmacy -> pharmacy (supported)
            // hospital -> hospital (supported)
            // police -> police (supported)
            const gType = type;
            const radius = 5000; // 5km radius
            const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=${gType}&key=${googleKey}`;

            const r = await fetch(url);
            const data = await r.json();

            if (data.status === 'OK' && Array.isArray(data.results)) {
              // Take top 3
              for (const place of data.results.slice(0, 3)) {
                const placeLat = place.geometry.location.lat;
                const placeLon = place.geometry.location.lng;

                // Google nearbysearch doesn't always return phone number. 
                // We would need Place Details to get phone. 
                // For now, we use the specific SOS number as fallback if phone is missing?
                // Or we map the emergency number. 

                const mappedPhone = type === 'police' ? mapEmergencyNumber(countryCode, 'police')
                  : type === 'hospital' ? mapEmergencyNumber(countryCode, 'medical')
                    : type === 'pharmacy' ? mapEmergencyNumber(countryCode, 'pharmacy')
                      : ''; // Embassy has no generic number

                results.push({
                  id: place.place_id,
                  name: place.name,
                  type: type,
                  address: place.vicinity || place.formatted_address || '',
                  phone: mappedPhone,
                  latitude: placeLat,
                  longitude: placeLon,
                  distance: '—' // Calculated later
                });
              }
            }
          } catch (e) {
            console.error(`Google Places error for ${type}:`, e);
          }
        }));

      } else {
        // --- NOMINATIM FALLBACK (Legacy Strategy) ---
        const delta = 0.08;
        const left = (lon - delta).toFixed(6);
        const right = (lon + delta).toFixed(6);
        const top = (lat + delta).toFixed(6);
        const bottom = (lat - delta).toFixed(6);

        await Promise.all(types.map(async (t) => {
          try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(t)}&viewbox=${left},${top},${right},${bottom}&bounded=1`;
            const r = await fetch(url, { headers: { 'User-Agent': 'TripMate/1.0', 'Accept-Language': 'en' } });
            const j = await r.json();
            const arr = Array.isArray(j) ? j : [];

            for (let i = 0; i < Math.min(arr.length, 3); i++) {
              const it: any = arr[i];
              const name = String(it.display_name?.split(',')[0] || t);
              const address = String(it.display_name || '');
              const latitude = parseFloat(it.lat);
              const longitude = parseFloat(it.lon);
              const phone = t === 'police' ? mapEmergencyNumber(countryCode, 'police')
                : t === 'hospital' ? mapEmergencyNumber(countryCode, 'medical')
                  : t === 'embassy' ? ''
                    : mapEmergencyNumber(countryCode, 'pharmacy');

              results.push({ id: `${t}-${i}`, name, type: t, address, phone, distance: '—', latitude, longitude });
            }
          } catch (e) { console.error(`Nominatim error for ${t}:`, e); }
        }));
      }

      // 4. Calculate Distances & Sort
      const toKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      const withDist = results.map(r => ({ ...r, distance: `${toKm(lat, lon, r.latitude, r.longitude).toFixed(1)} km` }));
      withDist.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

      // 5. Final Fallback if empty (AI)
      if (withDist.length === 0) {
        // If Google/Nominatim failed, ask AI for help in that city/country
        const fallback = await ai.emergency(`${countryName || countryCode}`);
        return res.json({
          services: fallback, // AI return structure might be different, let's normalize?
          // Actually existing AI function returns array of objects similar to our service structure
          // but let's wrap it consistent with response
          countryCode,
          sosNumbers: {
            police: mapEmergencyNumber(countryCode, 'police'),
            medical: mapEmergencyNumber(countryCode, 'medical'),
            fire: mapEmergencyNumber(countryCode, 'fire'),
            common: mapEmergencyNumber(countryCode, 'police') // Default common
          }
        });
      }

      // 6. Return standard structured response
      return res.json({
        services: withDist.slice(0, 15),
        countryCode,
        sosNumbers: {
          police: mapEmergencyNumber(countryCode, 'police'),
          medical: mapEmergencyNumber(countryCode, 'medical'),
          fire: mapEmergencyNumber(countryCode, 'fire'),
          common: mapEmergencyNumber(countryCode, 'police')
        }
      });

    } catch (error) {
      console.error('Emergency API error:', error);
      res.status(500).json([]);
    }
  });

  function mapEmergencyNumber(countryCode: string, kind: 'police' | 'medical' | 'fire' | 'pharmacy'): string {
    const inMap = { police: '100', medical: '108', fire: '101', pharmacy: '1860-500-0100' };
    const usMap = { police: '911', medical: '911', fire: '911', pharmacy: '' };
    const euMap = { police: '112', medical: '112', fire: '112', pharmacy: '' };
    const code = countryCode.toUpperCase();
    if (code === 'IN') return (inMap as any)[kind] || '112';
    if (code === 'US') return (usMap as any)[kind] || '';
    // Default to EU single number for many countries
    return (euMap as any)[kind] || '';
  }

  app.post('/api/v1/trips/sync', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const ops: Array<{ id?: string; tempId?: string; op: 'create' | 'update' | 'delete'; data?: any }> = Array.isArray(req.body?.operations) ? req.body.operations : [];
      const results: Array<{ ok: boolean; id?: string; tempId?: string; error?: string }> = [];
      for (const op of ops) {
        try {
          if (op.op === 'create' && op.data) {
            const data = { ...op.data, userId };
            const tripData = insertTripSchema.parse(data);
            const created = await storage.createTrip(tripData);
            results.push({ ok: true, id: String(created._id || created.id), tempId: op.tempId });
          } else if (op.op === 'update' && op.id && op.data) {
            const updates = insertTripSchema.partial().parse(op.data);
            const updated = await storage.updateTrip(op.id, userId, updates);
            results.push({ ok: !!updated, id: op.id });
          } else if (op.op === 'delete' && op.id) {
            const deleted = await storage.deleteTrip(op.id, userId);
            results.push({ ok: !!deleted, id: op.id });
          } else {
            results.push({ ok: false, tempId: op.tempId, error: 'invalid_op' });
          }
        } catch (e: any) {
          results.push({ ok: false, tempId: op.tempId, id: op.id, error: String(e?.message || 'error') });
        }
      }
      res.json({ results });
    } catch (error) {
      console.error('Trips sync error:', error);
      res.status(500).json({ error: 'sync_failed' });
    }
  });

  // Trip planning tool (strict JSON via OpenAI, server-side key only)
  app.post('/api/tools/planTrip', optionalAuth, aiLimit, async (req: any, res) => {
    try {
      const destination = String(req.body?.destination || '').trim();
      const days = Number(req.body?.days || 0);
      const persons = Number(req.body?.persons || 0);
      const budgetRaw = req.body?.budget;
      const budget = budgetRaw === undefined || budgetRaw === null ? undefined : Number(budgetRaw);
      const typeOfTrip = String(req.body?.typeOfTrip || '').trim();
      const travelMedium = String(req.body?.travelMedium || '').trim();

      if (!destination || !days || !persons || !typeOfTrip || !travelMedium) {
        return res.status(400).json({ error: 'invalid_input', message: 'destination, days, persons, typeOfTrip, travelMedium are required' });
      }

      const ts = new Date().toISOString();
      const maskedDest = destination.replace(/\d/g, 'x');
      console.log(JSON.stringify({ ts, tool: 'planTrip', input: { destination: maskedDest, days, persons, budget: typeof budget === 'number' ? 'n' : '—', typeOfTrip, travelMedium } }));

      const inflightKey = `tool:${destination}:${days}:${persons}:${budget ?? 'x'}:${typeOfTrip}:${travelMedium}`;
      const inflight = (app.locals as any).inflightPlanTrip || new Map<string, Promise<any>>();
      (app.locals as any).inflightPlanTrip = inflight;
      let task = inflight.get(inflightKey);
      if (!task) {
        task = ai.planTrip({ destination, days, persons, budget, typeOfTrip, travelMedium });
        inflight.set(inflightKey, task);
      }
      const result = await task;
      if (result && result.error === 'providers_unavailable') {
        return res.status(503).json({ error: 'providers_unavailable', message: 'AI providers unavailable' });
      }
      if (result && result.error === 'invalid_model_output') {
        return res.status(502).json(result);
      }
      inflight.delete(inflightKey);
      return res.json(result);
    } catch (error) {
      console.error('PlanTrip tool error:', error);
      res.status(500).json({ error: 'tool_error', message: 'Unexpected error' });
    }
  });

  // Compatibility route: generate itinerary via server-side planTrip tool
  app.post('/api/v1/trips/generate-itinerary', isJwtAuthenticated, aiLimit, async (req: any, res) => {
    try {
      const BodySchema = z.object({
        destination: z.string().min(2),
        days: z.coerce.number().int().min(1),
        persons: z.coerce.number().int().min(1),
        budget: z.coerce.number().nonnegative().optional(),
        currency: z.string().optional(),
        typeOfTrip: z.string().min(2),
        travelMedium: z.string().min(2),
        preferences: z.string().optional(),
      });
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(422).json({ error: 'invalid_input', details: parsed.error.issues });
      }
      const { destination, days, persons, budget, currency, typeOfTrip, travelMedium } = parsed.data;
      const ts = new Date().toISOString();
      console.log(JSON.stringify({ ts, endpoint: '/api/v1/trips/generate-itinerary', dest: destination.slice(0, 16) + '…', days, persons, budget: typeof budget === 'number' ? 'n' : '—', currency, typeOfTrip, travelMedium }));
      const inflightKey = `compat:${destination}:${days}:${persons}:${budget ?? 'x'}:${currency ?? 'INR'}:${typeOfTrip}:${travelMedium}`;
      const inflight = (app.locals as any).inflightCompatPlan || new Map<string, Promise<any>>();
      (app.locals as any).inflightCompatPlan = inflight;
      let task = inflight.get(inflightKey);
      if (!task) {
        task = ai.planTrip({ destination, days, persons, budget, currency, typeOfTrip, travelMedium });
        inflight.set(inflightKey, task);
      }
      const plan = await task;
      if (plan && plan.error === 'providers_unavailable') {
        return res.status(503).json({ error: 'providers_unavailable', message: 'AI providers unavailable' });
      }
      if (plan && plan.error === 'invalid_model_output') {
        return res.status(502).json(plan);
      }
      inflight.delete(inflightKey);
      return res.json(plan);
    } catch (error: any) {
      console.error('generate-itinerary error:', error?.message || error);
      return res.status(500).json({ error: 'server_error', message: 'Failed to generate itinerary' });
    }
  });

  // Health check to verify API availability
  app.get('/api/v1/health', async (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // Auto-fetch trip image
  app.post('/api/v1/trips/:id/image', isJwtAuthenticated, async (req: any, res) => {
    try {
      const trip = await storage.getTrip(req.params.id, req.user.id);
      if (!trip) return res.status(404).json({ error: 'Trip not found' });
      if (trip.userId !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

      // If already has image and not force refresh, return it
      if (trip.imageUrl && !req.query.force) {
        return res.json({ imageUrl: trip.imageUrl });
      }

      const gkey = process.env.GOOGLE_PLACES_API_KEY;
      if (!gkey) return res.status(503).json({ error: 'No Places API key' });

      const gurl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(trip.destination + ' travel')}&key=${gkey}`;
      const gr = await fetch(gurl);
      const gj = await gr.json();

      let imageUrl = '';
      if (gj.status === 'OK' && gj.results && gj.results.length > 0) {
        const place = gj.results[0];
        if (place.photos && place.photos.length > 0) {
          imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${place.photos[0].photo_reference}&key=${gkey}`;
        }
      }

      if (imageUrl) {
        const updated = await storage.updateTrip(trip.id, req.user.id, { imageUrl });
        return res.json({ imageUrl: updated?.imageUrl });
      }

      return res.json({ imageUrl: null });
    } catch (error) {
      console.error('Fetch trip image error:', error);
      res.status(500).json({ error: 'Failed to fetch image' });
    }
  });

  // Update Itinerary (Reorder/Edit)
  app.put('/api/v1/trips/:id/itinerary', isJwtAuthenticated, async (req: any, res) => {
    try {
      const trip = await storage.getTrip(req.params.id, req.user.id);
      if (!trip) return res.status(404).json({ error: 'Trip not found' });

      const { itinerary } = req.body;
      if (!Array.isArray(itinerary)) return res.status(400).json({ error: 'Invalid itinerary format' });

      // Ensure every activity has an ID
      const updatedItinerary = itinerary.map((day: any) => ({
        ...day,
        activities: Array.isArray(day.activities) ? day.activities.map((act: any) => ({
          ...act,
          id: act.id || Math.random().toString(36).substring(7)
        })) : []
      }));

      const updated = await storage.updateTrip(trip.id, req.user.id, { itinerary: updatedItinerary });
      res.json(updated?.itinerary);
    } catch (error) {
      console.error('Update itinerary error:', error);
      res.status(500).json({ error: 'Failed to update itinerary' });
    }
  });

  // Add Expense
  app.post('/api/v1/trips/:id/expenses', isJwtAuthenticated, async (req: any, res) => {
    try {
      const trip = await storage.getTrip(req.params.id, req.user.id);
      if (!trip) return res.status(404).json({ error: 'Trip not found' });

      const newExpense = {
        id: Math.random().toString(36).substring(7),
        ...req.body,
        date: new Date(req.body.date || Date.now())
      };

      const currentExpenses = trip.expenses || [];
      const updated = await storage.updateTrip(trip.id, req.user.id, {
        expenses: [...currentExpenses, newExpense]
      });

      res.json(updated?.expenses);
    } catch (error) {
      console.error('Add expense error:', error);
      res.status(500).json({ error: 'Failed to add expense' });
    }
  });

  // Delete Expense
  app.delete('/api/v1/trips/:id/expenses/:expenseId', isJwtAuthenticated, async (req: any, res) => {
    try {
      const trip = await storage.getTrip(req.params.id, req.user.id);
      if (!trip) return res.status(404).json({ error: 'Trip not found' });

      const currentExpenses = trip.expenses || [];
      const filtered = currentExpenses.filter((e: any) => e.id !== req.params.expenseId);

      const updated = await storage.updateTrip(trip.id, req.user.id, { expenses: filtered });
      res.json(updated?.expenses);
    } catch (error) {
      console.error('Delete expense error:', error);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  });

  // AI Trip Suggestions API
  app.post('/api/v1/trips/suggest', isJwtAuthenticated, async (req: any, res) => {
    try {
      const { destination, days, travelStyle, budget } = req.body;

      // Mock AI suggestions - in production, integrate with OpenAI or similar
      const suggestions = generateTripSuggestions(destination, days, travelStyle, budget);

      res.json({
        destination,
        days,
        travelStyle,
        suggestions
      });
    } catch (error) {
      console.error("Error generating trip suggestions:", error);
      res.status(500).json({ message: "Failed to generate suggestions" });
    }
  });

  // Version info and compatibility
  app.get('/api/v1/version', (_req, res) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      res.json({ version: pkg.version, node: process.version });
    } catch {
      res.json({ version: 'unknown', node: process.version });
    }
  });

  // Readiness/Liveness endpoints
  app.get('/api/v1/liveness', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });
  app.get('/api/v1/readiness', (req, res) => {
    const ready = (req.app.locals as any).ready === true;
    res.status(ready ? 200 : 503).json({ ok: ready, ts: Date.now() });
  });

  // Tools status endpoint
  app.get('/api/v1/tools/status', (_req, res) => {
    try {
      const tools = {
        weather: true,
        planTrip: true,
        translate: true,
        currency: true,
        emergency: true,
      };
      res.json({ tools });
    } catch {
      res.status(500).json({ tools: {} });
    }
  });

  // Geocoding proxy: Google Places API (primary) with OpenWeatherMap fallback
  app.get('/api/v1/geocode', optionalAuth, async (req: any, res) => {
    try {
      const raw = String(req.query.query || req.query.q || '').trim();
      if (!raw) return res.status(400).json({ error: 'query required' });
      const sanitized = raw
        .replace(/[\u0000-\u001F]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      console.log(`[Geocode] Request for: "${sanitized}"`);

      const cache: Map<string, { ts: number; value: any }> = (req.app.locals as any).geocodeCache || new Map();
      (req.app.locals as any).geocodeCache = cache;
      const TTL = 10 * 60 * 1000;
      const cached = cache.get(sanitized);
      if (cached && (Date.now() - cached.ts) < TTL) {
        console.log(`[Geocode] Returning cached result for: "${sanitized}"`);
        return res.json(cached.value);
      }

      let results: any[] = [];

      // Try Google Geocoding API first (better for addresses/cities)
      const googleKey = process.env.GOOGLE_PLACES_API_KEY; // Reusing the key, usually works for both
      if (googleKey) {
        try {
          // Attempt 1: Standard Geocoding (optimized for addresses/cities)
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(sanitized)}&language=en&key=${googleKey}`;
          const geocodeRes = await fetch(geocodeUrl);
          const geocodeData = await geocodeRes.json();

          if (geocodeData.status === 'OK' && geocodeData.results && geocodeData.results.length > 0) {
            results = geocodeData.results.slice(0, 5).map((place: any) => ({
              name: place.address_components?.find((c: any) => c.types.includes('locality'))?.long_name ||
                place.address_components?.[0]?.long_name || '',
              lat: place.geometry?.location?.lat || 0,
              lon: place.geometry?.location?.lng || 0,
              display_name: place.formatted_address || '',
              state: place.address_components?.find((c: any) => c.types.includes('administrative_area_level_1'))?.short_name || '',
              country: place.address_components?.find((c: any) => c.types.includes('country'))?.short_name || '',
              source: 'google_geocode'
            }));
            console.log(`[Geocode] Google Geocode results for "${sanitized}":`, JSON.stringify(results[0]));
            cache.set(sanitized, { ts: Date.now(), value: results });
            return res.json(results);
          } else {
            console.log(`[Geocode] Google Geocode returned no results (Status: ${geocodeData.status})`);

            // Attempt 2: Fallback to Places Text Search with " city" suffix if Geocode failed
            // This helps ensure we get a locality even if the exact name matches a POI like "Vapi Inc."
            const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(sanitized + " city")}&language=en&key=${googleKey}`;
            const tsRes = await fetch(textSearchUrl);
            const tsData = await tsRes.json();

            if (tsData.status === 'OK' && tsData.results && tsData.results.length > 0) {
              results = tsData.results.slice(0, 5).map((place: any) => ({
                name: place.name || '',
                lat: place.geometry?.location?.lat || 0,
                lon: place.geometry?.location?.lng || 0,
                display_name: place.formatted_address || place.name || '',
                state: '',
                country: '',
                source: 'google_places_city_fallback'
              }));
              console.log(`[Geocode] Google Places Fallback results for "${sanitized}":`, JSON.stringify(results[0]));
              cache.set(sanitized, { ts: Date.now(), value: results });
              return res.json(results);
            }
          }
        } catch (err) {
          console.error('Google API error:', err);
          // Fall through to OpenWeather
        }
      }

      // Fallback to OpenWeather if Google failed or not configured, AND if we actually have a weather key
      // The previous code incorrectly used GOOGLE_API_KEY here.
      const weatherKey = process.env.OPENWEATHER_API_KEY;
      if (weatherKey) {
        try {
          const r = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(sanitized)}&limit=5&appid=${weatherKey}`);
          let list = await r.json().catch(() => []);
          if (r.ok && Array.isArray(list) && list.length > 0) {
            results = list.map((first: any) => {
              const name = String((first.local_names && (first.local_names.en || first.local_names['en'])) || first.name || '').trim();
              const state = String(first.state || '').trim();
              const country = String(first.country || '').trim();
              const lat = Number(first.lat);
              const lon = Number(first.lon);
              const displayName = [name, state, country].filter(Boolean).join(', ');
              return { name, state, country, lat, lon, displayName };
            });
            console.log(`[Geocode] OpenWeather results for "${sanitized}":`, JSON.stringify(results[0]));
            cache.set(sanitized, { ts: Date.now(), value: results });
            return res.json(results);
          } else {
            console.log(`[Geocode] OpenWeather returned no results or error`);
          }
        } catch (err) {
          console.error('OpenWeather geocode error:', err);
        }
      }

      // Last resort: try Nominatim
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&dedupe=1&limit=5&q=${encodeURIComponent(sanitized)}`;
        const rn = await fetch(url, { headers: { 'User-Agent': 'TripMate/1.0 (+https://example.com)', 'Accept-Language': 'en' } });
        const arr = await rn.json();
        if (Array.isArray(arr) && arr.length) {
          results = arr.map((it: any) => {
            const addr = it.address || {};
            const namedetails = it.namedetails || {};
            const nameEn = String(namedetails['name:en'] || '').trim();
            const nameLocal = String(it.localname || it.name || '').trim();
            const displayNameFirst = String(it.display_name || '').split(',')[0].trim();

            let name = nameEn;
            if (!name) {
              // Try to use ASCII version if local name is non-ASCII
              const asciiLocal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const al = asciiLocal(nameLocal);
              if (al !== nameLocal && al.length > 0) name = al;
              else if (/^[\x00-\x7F]+$/.test(displayNameFirst)) name = displayNameFirst;
              else name = nameLocal;
            }

            const state = String(addr.state || '').trim();
            const country = String(addr.country || '').trim();
            const lat = Number(it.lat);
            const lon = Number(it.lon);
            const displayName = [name, state, country].filter(Boolean).join(', ');
            return { name, state, country, lat, lon, displayName };
          });
          console.log(`[Geocode] Nominatim results for "${sanitized}":`, JSON.stringify(results[0]));
          cache.set(sanitized, { ts: Date.now(), value: results });
          return res.json(results);
        } else {
          console.log(`[Geocode] Nominatim returned no results`);
        }
      } catch (err) {
        console.error('Nominatim geocode error:', err);
      }

      return res.status(404).json({ error: 'Location not found' });
    } catch (error: any) {
      console.error('Geocode error:', error);
      return res.status(500).json({ error: 'geocode failed', details: error?.message || String(error), stack: error?.stack });
    }
  });

  // Places search: Nominatim-backed full-text search with English display, pagination, and caching
  app.get('/api/v1/places/search', optionalAuth, async (req: any, res) => {
    try {
      const rawQ = String(req.query.query || req.query.q || '').trim();
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize || 20)));
      const autocomplete = String(req.query.autocomplete || '0') === '1';
      if (!rawQ || rawQ.length < 2) return res.status(400).json({ error: 'query_too_short' });

      const q = rawQ
        .replace(/[\u0000-\u001F]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const cache: Map<string, { ts: number; value: any[] }> = (req.app.locals as any).placesSearchCache || new Map();
      (req.app.locals as any).placesSearchCache = cache;
      const TTL = 10 * 60 * 1000;
      const cacheKey = `q:${q}`;
      const now = Date.now();
      let list: any[] | undefined;
      const cached = cache.get(cacheKey);
      if (cached && (now - cached.ts) < TTL) {
        list = cached.value;
      }

      if (!list) {
        const gkey = process.env.GOOGLE_PLACES_API_KEY || '';
        if (gkey) {
          try {
            const limitFetch = autocomplete ? 10 : Math.max(pageSize, 50);
            const gurl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&language=en&key=${gkey}`;
            const gr = await fetch(gurl, { headers: { 'User-Agent': 'TripMate/1.0' } });
            const gj = await gr.json().catch(() => ({}));
            const gres = Array.isArray((gj as any).results) ? (gj as any).results : [];
            list = gres.slice(0, limitFetch).map((it: any) => {
              const formatted = String(it.formatted_address || '');
              const parts = formatted.split(',').map(p => p.trim());
              return {
                osm_id: String(it.place_id || `${it.name || 'place'}-${Math.random()}`),
                name: String(it.name || ''),
                namedetails: { 'name:en': String(it.name || ''), name: String(it.name || '') },
                address: {
                  city: parts.length > 1 ? parts[parts.length - 2] : '',
                  state: '',
                  country: parts.length > 0 ? parts[parts.length - 1] : '',
                  road: parts.length > 2 ? parts[0] : ''
                },
                lat: Number(it.geometry?.location?.lat ?? 0),
                lon: Number(it.geometry?.location?.lng ?? 0),
                display_name: String(it.formatted_address || it.name || ''),
                photoUrl: it.photos && it.photos.length > 0
                  ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${it.photos[0].photo_reference}&key=${gkey}`
                  : undefined,
                source: 'google',
              };
            });
            list = Array.isArray(list) ? list : [];
            cache.set(cacheKey, { ts: now, value: list });
          } catch {
            // fall through to nominatim
          }
        }
        if (!list || !Array.isArray(list) || list.length === 0) {
          const limitFetch = autocomplete ? 10 : Math.max(pageSize, 50);
          const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&namedetails=1&dedupe=1&q=${encodeURIComponent(q)}&limit=${limitFetch}`;
          const r = await fetch(url, { headers: { 'User-Agent': 'TripMate/1.0 (+https://example.com)', 'Accept-Language': 'en' } });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            const msg = String((j as any)?.message || 'search_failed');
            return res.status(r.status).json({ error: msg });
          }
          const arr = await r.json();
          const nominatimList = Array.isArray(arr) ? arr : [];
          list = nominatimList.map((it: any) => ({
            ...it,
            name: it.namedetails?.['name:en'] || it.namedetails?.name || it.display_name?.split(',')[0] || '',
          }));
          cache.set(cacheKey, { ts: now, value: list });
        }
      }

      // Fallback: if Nominatim found nothing and we have weather key, try OpenWeather Direct Geocoding (city-level)
      if (Array.isArray(list) && list.length === 0) {
        const owKey = process.env.OPENWEATHER_API_KEY || '';
        if (owKey) {
          try {
            const ro = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${Math.max(5, autocomplete ? 5 : 10)}&appid=${owKey}`);
            const jo = await ro.json().catch(() => []);
            if (Array.isArray(jo) && jo.length) {
              list = jo.map((o: any) => ({
                osm_id: `${o.lat}-${o.lon}-${o.name}`,
                name: o.name || '',
                namedetails: { 'name:en': (o.local_names && (o.local_names.en || o.local_names['en'])) || o.name || '' },
                address: { city: o.name || '', state: o.state || '', country: o.country || '' },
                lat: o.lat,
                lon: o.lon,
                display_name: [o.name, o.state, o.country].filter(Boolean).join(', '),
              }));
            }
          } catch { }
        }
      }

      const toAscii = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normalizeItem = (it: any) => {
        const addr = it.address || {};
        const namedetails = it.namedetails || {};

        // Prioritize English name, then transliterated, then local as fallback
        const nameEnRaw = String(namedetails['name:en'] || '').trim();
        const nameLocal = String(namedetails.name || it.name || '').trim();
        const displayNameFirst = String(it.display_name || '').split(',')[0].trim();

        // Use English name if available, otherwise transliterate the local name to ASCII
        // If transliteration fails or is same as local (and local is non-ASCII), try to use the first part of display_name
        let nameEn = nameEnRaw;
        if (!nameEn) {
          const asciiLocal = toAscii(nameLocal);
          // If local name has non-ascii chars and ascii version is different, use it
          if (asciiLocal !== nameLocal && asciiLocal.length > 0) {
            nameEn = asciiLocal;
          } else {
            // Fallback to display name first part if it looks like English (ASCII)
            const firstPart = displayNameFirst;
            if (/^[\x00-\x7F]+$/.test(firstPart)) {
              nameEn = firstPart;
            } else {
              nameEn = nameLocal; // Give up and use local
            }
          }
        }

        const road = String(addr.road || addr.street || addr.residential || addr.pedestrian || addr.footway || addr.path || '').trim();
        const city = String(addr.city || addr.town || addr.village || addr.hamlet || addr.county || '').trim();
        const country = String(addr.country || '').trim();
        const postcode = String(addr.postcode || '').trim();
        const lat = Number(it.lat);
        const lon = Number(it.lon);
        const displayName = String(it.display_name || '').trim();
        return {
          id: String(it.osm_id || `${lat}-${lon}`),
          name_en: nameEn,
          name_local: nameLocal || nameEn,
          transliteration: toAscii(nameLocal || nameEn || ''),
          road,
          city,
          country,
          postcode,
          lat,
          lon,
          display_name: displayName,
          source: String(it.source || 'nominatim'),
        };
      };

      const items = (Array.isArray(list) ? list : []).map(normalizeItem);
      const total = items.length;
      const start = (page - 1) * pageSize;
      const end = Math.min(start + pageSize, total);
      const pageItems = autocomplete ? items.slice(0, Math.min(10, total)) : items.slice(start, end);
      return res.json({ query: q, page, pageSize, total, items: pageItems });
    } catch (error) {
      console.error('Places search error:', error);
      return res.status(500).json({ error: 'search_failed' });
    }
  });

  // Reverse geocoding proxy: OpenWeatherMap Reverse Geocoding to convert lat/lon into display name
  // Reverse geocoding proxy: Google Maps (Primary) -> Nominatim (Fallback)
  app.get('/api/v1/reverse-geocode', optionalAuth, async (req: any, res) => {
    try {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat_lon_required' });

      const googleKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;

      const cache: Map<string, { ts: number; value: any }> = (req.app.locals as any).revGeocodeCache || new Map();
      (req.app.locals as any).revGeocodeCache = cache;
      const TTL = 10 * 60 * 1000;
      const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      const cached = cache.get(k);
      if (cached && (Date.now() - cached.ts) < TTL) {
        return res.json(cached.value);
      }

      let payload = null;

      // 1. Try Google Maps Geocoding
      if (googleKey) {
        try {
          const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${googleKey}`;
          const r = await fetch(url);
          const data = await r.json();
          if (data.status === 'OK' && data.results && data.results.length > 0) {
            const first = data.results[0];
            const comps = first.address_components || [];

            const getComp = (type: string) => comps.find((c: any) => c.types.includes(type))?.long_name || '';
            const city = getComp('locality') || getComp('administrative_area_level_2');
            const state = getComp('administrative_area_level_1');
            const country = getComp('country');
            const name = city || getComp('sublocality') || 'Unknown Location';

            payload = {
              name,
              state,
              country,
              lat,
              lon,
              displayName: first.formatted_address || [city, state, country].filter(Boolean).join(', ')
            };
          }
        } catch (e) {
          console.error('Google reverse geocode failed:', e);
        }
      }

      // 2. Fallback to Nominatim
      if (!payload) {
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
          const r = await fetch(url, { headers: { 'User-Agent': 'TripMate/1.0' } });
          if (r.ok) {
            const data = await r.json();
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.village || addr.county || '';
            const state = addr.state || '';
            const country = addr.country || '';
            const name = city || 'Unknown Location';

            payload = {
              name,
              state,
              country,
              lat,
              lon,
              displayName: data.display_name || [city, state, country].filter(Boolean).join(', ')
            };
          }
        } catch (e) {
          console.error('Nominatim reverse geocode failed:', e);
        }
      }

      if (!payload) {
        return res.status(404).json({ error: 'location_not_found' });
      }

      cache.set(k, { ts: Date.now(), value: payload });
      return res.json(payload);

    } catch (error) {
      console.error('Reverse geocode error:', error);
      return res.status(500).json({ error: 'reverse_geocode_failed' });
    }
  });

  // Tourist attractions endpoint using Overpass API (OpenStreetMap)
  app.get('/api/v1/places/tourist-attractions', optionalAuth, async (req: any, res) => {
    try {
      const location = String(req.query.location || '').trim();
      const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize || 20)));

      if (!location) {
        return res.status(400).json({ error: 'location_required' });
      }

      // Step 1: Geocode the location using Nominatim
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
      const geocodeRes = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'TripMate/1.0 (+https://example.com)',
          'Accept-Language': 'en'
        }
      });
      const geocodeData = await geocodeRes.json();

      if (!Array.isArray(geocodeData) || geocodeData.length === 0) {
        console.error('[tourist-attractions] Nominatim geocoding failed for:', location);
        return res.status(404).json({ error: 'location_not_found', query: location, page: 1, pageSize, total: 0, items: [] });
      }

      const { lat, lon, display_name } = geocodeData[0];
      console.log('[tourist-attractions] Geocoded location:', location, '-> lat:', lat, 'lon:', lon);

      // Step 2: Query Overpass API for tourist attractions
      // Search within ~5km radius
      const radius = 5000;
      const overpassQuery = `
        [out:json][timeout:25];
        (
          node["tourism"="attraction"](around:${radius},${lat},${lon});
          node["tourism"="museum"](around:${radius},${lat},${lon});
          node["tourism"="viewpoint"](around:${radius},${lat},${lon});
          node["tourism"="artwork"](around:${radius},${lat},${lon});
          node["historic"](around:${radius},${lat},${lon});
          way["tourism"="attraction"](around:${radius},${lat},${lon});
          way["tourism"="museum"](around:${radius},${lat},${lon});
        );
        out body ${pageSize};
      `.trim();

      const overpassUrl = 'https://overpass-api.de/api/interpreter';
      const overpassRes = await fetch(overpassUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`
      });

      if (!overpassRes.ok) {
        console.error('[tourist-attractions] Overpass API error:', overpassRes.status);
        return res.status(502).json({ error: 'overpass_api_error' });
      }

      const overpassData = await overpassRes.json();
      const elements = overpassData.elements || [];
      console.log('[tourist-attractions] Overpass API found', elements.length, 'elements');

      // Transform to match the existing places/search format
      const toAscii = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const items = elements.slice(0, pageSize).map((element: any, index: number) => {
        // Prioritize English name, then transliterate local name, then fallback
        const nameEn = element.tags?.['name:en'] || '';
        const nameLocal = element.tags?.name || '';
        const fallbackName = element.tags?.historic || element.tags?.tourism || `Attraction ${index + 1}`;

        // Use English name if available, otherwise transliterate the local name
        const finalNameEn = nameEn || toAscii(nameLocal) || fallbackName;
        const finalNameLocal = nameLocal || nameEn || fallbackName;

        const elLat = element.lat || element.center?.lat || 0;
        const elLon = element.lon || element.center?.lon || 0;

        return {
          id: `osm-${element.type}-${element.id}`,
          name_en: finalNameEn,
          name_local: finalNameLocal,
          transliteration: toAscii(finalNameLocal),
          road: element.tags?.['addr:street'] || '',
          city: element.tags?.['addr:city'] || location,
          country: element.tags?.['addr:country'] || '',
          postcode: element.tags?.['addr:postcode'] || '',
          lat: elLat,
          lon: elLon,
          display_name: `${finalNameEn}, ${location}`,
          source: 'overpass_api',
        };
      });

      return res.json({
        query: location,
        page: 1,
        pageSize,
        total: items.length,
        items,
      });
    } catch (error) {
      console.error('[tourist-attractions] error:', error);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/v1/trips/:id/ai-plan', isJwtAuthenticated, aiLimit, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const tripId = req.params.id;
      const trip = await storage.getTrip(tripId, userId);
      if (!trip) {
        return res.status(404).json({ message: 'Trip not found' });
      }

      const input = req.body || {};
      const destination = String(input.location || trip.destination || '').trim();
      const budget = Number(input.budget ?? trip.budget ?? 0);
      const people = Number(input.people ?? trip.groupSize ?? 1);
      const notes = String(input.notes ?? trip.notes ?? '').trim();
      const days = Number(input.days ?? trip.days ?? 3);
      const style = String(input.travelStyle ?? trip.travelStyle ?? 'standard');
      const transport = String(input.transportMode ?? trip.transportMode ?? '');
      if (!destination || !Number.isFinite(days) || days <= 0 || !Number.isFinite(people) || people <= 0 || !Number.isFinite(budget) || budget < 0) {
        return res.status(400).json({ message: 'Invalid input' });
      }
      // Idempotency: return existing plan if already generated
      if (trip.aiPlanMarkdown && String(trip.aiPlanMarkdown).trim().length > 0) {
        return res.json({ markdown: String(trip.aiPlanMarkdown) });
      }

      const inflightKey = `${userId}:${tripId}`;
      if (inflightPlans.has(inflightKey)) {
        const md = await inflightPlans.get(inflightKey)!;
        return res.json({ markdown: md });
      }

      const prompt = [
        `Create a detailed, practical trip plan in Markdown for ${destination}.`,
        `Constraints: ${days} days, budget ₹${budget} total, group size ${people}.`,
        style ? `Travel style: ${style}.` : '',
        transport ? `Primary transport: ${transport}.` : '',
        notes ? `Additional notes: ${notes}.` : '',
        `Include sections with clear headings: Overview, Daily Itinerary (by day with times), Accommodation suggestions (2–3 per budget), Food recommendations, Local transport tips, Budget breakdown table, Safety and etiquette tips, Packing checklist, and Final reminders.`,
        `Use only Markdown. Avoid code fences. Keep it concise, well-structured, and locally relevant.`
      ].filter(Boolean).join(' ');

      const geminiKey = process.env.Google_Gemini_Key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
      const timeoutMs = 60000;
      const task = (async () => {
        let markdown = '';
        const ts = new Date().toISOString();
        try {
          markdown = await generateMarkdownGemini(prompt, geminiKey, timeoutMs);
          console.log(JSON.stringify({ ts, api_used: 'gemini', userId, tripId }));
        } catch (e: any) {
          const errMsg = String(e?.message || e || 'error');
          console.warn(JSON.stringify({ ts, api_used: 'gemini', status: 'failed', reason: errMsg, userId, tripId }));
          try {
            markdown = await generateMarkdownOpenAI(prompt, timeoutMs);
            console.log(JSON.stringify({ ts, api_used: 'openai', userId, tripId }));
          } catch (e2: any) {
            const errMsg2 = String(e2?.message || e2 || 'error');
            console.error(JSON.stringify({ ts, api_used: 'openai', status: 'failed', reason: errMsg2, userId, tripId }));
            throw new Error('providers_unavailable');
          }
        }
        const updated = await storage.updateTrip(tripId, userId, { aiPlanMarkdown: markdown } as any);
        return String(updated?.aiPlanMarkdown || markdown);
      })();

      inflightPlans.set(inflightKey, task);
      try {
        const md = await task;
        return res.json({ markdown: md });
      } finally {
        inflightPlans.delete(inflightKey);
      }
    } catch (error) {
      console.error('AI plan error:', error);
      const msg = String((error as any)?.message || 'Failed to generate plan');
      const status = msg === 'providers_unavailable' ? 503 : 500;
      res.status(status).json({ message: 'Failed to generate plan' });
    }
  });

  function generateTripSuggestions(
    destination: string,
    days: number,
    travelStyle: string,
    budget?: number
  ) {
    const baseActivities = [
      { title: "City walking tour", time: "09:00", location: destination },
      { title: "Local cuisine tasting", time: "13:00", location: destination },
      { title: "Sunset viewpoint", time: "18:30", location: destination }
    ];

    const styleExtras: Record<string, any[]> = {
      adventure: [
        { title: "Hiking trail", time: "07:30", location: "National Park" },
        { title: "Kayaking", time: "15:00", location: "River" }
      ],
      relaxed: [
        { title: "Spa session", time: "11:00", location: "Wellness Center" },
        { title: "Beach time", time: "16:00", location: "Coast" }
      ],
      cultural: [
        { title: "Museum visit", time: "10:00", location: "City Museum" },
        { title: "Historic district tour", time: "14:00", location: "Old Town" }
      ],
      culinary: [
        { title: "Cooking class", time: "12:00", location: "Local Kitchen" },
        { title: "Street food crawl", time: "19:00", location: "Night Market" }
      ],
      standard: []
    };

    const daysArray = Array.from({ length: Math.max(1, days) }, (_, i) => ({
      dayIndex: i + 1,
      activities: [...baseActivities, ...(styleExtras[travelStyle] || [])]
    }));

    return daysArray;
  }

  // Feedback submission endpoint
  app.post('/api/v1/feedback', async (req, res) => {
    try {
      const { type, category, subject, description, email } = req.body;

      if (!type || !category || !subject || !description || !email) {
        return res.status(400).json({ message: 'All fields are required' });
      }

      // Send email notification (if email service is configured)
      const { sendEmail } = await import("./email");

      const typeEmoji = type === 'bug' ? '🐛' : type === 'feature' ? '✨' : type === 'feedback' ? '💡' : '📝';

      await sendEmail({
        from: `"TripMate Feedback" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: "kasivasi2005@gmail.com", // Send explicitly to the requested email
        replyTo: email,
        subject: `${typeEmoji} [${type.toUpperCase()}] ${subject}`,
        html: `
          <h2>New ${type.charAt(0).toUpperCase() + type.slice(1)} Submission</h2>
          <p><strong>Type:</strong> ${type}</p>
          <p><strong>Category:</strong> ${category}</p>
          <p><strong>From:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr>
          <p><strong>Description:</strong></p>
          <p>${description.replace(/\n/g, '<br>')}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">Submitted via TripMate Feedback Form</p>
        `,
      });

      res.json({ success: true, message: 'Feedback submitted successfully' });
    } catch (error) {
      console.error('Feedback submission error:', error);
      res.status(500).json({ message: 'Failed to submit feedback' });
    }
  });

  // Temporary endpoint for testing: Delete all users
  app.delete("/api/v1/testing/reset-db", async (req, res) => {
    const { secret } = req.query;
    if (secret !== "antigravity_nuke") {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      if (useMemoryStore) {
        memoryUsers.clear();
        memorySessions.clear();
      } else {
        await storage.deleteAllUsers();
      }
      res.json({ message: "Database reset complete" });
    } catch (error) {
      console.error("Reset DB error:", error);
      res.status(500).json({ message: "Failed to reset DB" });
    }
  });

  const httpServer = createServer(app);
  // Packing List Routes
  app.get('/api/v1/packing-lists', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const lists = await storage.getUserPackingLists(userId);
      res.json(lists);
    } catch (e) {
      res.status(500).json({ message: 'Failed to fetch packing lists' });
    }
  });

  app.post('/api/v1/packing-lists', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const data = insertPackingListSchema.parse({ ...req.body, userId });
      const list = await storage.createPackingList(data);
      res.json(list);
    } catch (e) {
      res.status(400).json({ message: 'Invalid input' });
    }
  });

  app.put('/api/v1/packing-lists/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const id = req.params.id;
      const updates = insertPackingListSchema.partial().parse(req.body);
      const updated = await storage.updatePackingList(id, userId, updates);
      if (!updated) return res.status(404).json({ message: 'Not found' });
      res.json(updated);
    } catch (e) {
      res.status(400).json({ message: 'Invalid input' });
    }
  });

  app.delete('/api/v1/packing-lists/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const id = req.params.id;
      const success = await storage.deletePackingList(id, userId);
      if (!success) return res.status(404).json({ message: 'Not found' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: 'Failed to delete' });
    }
  });

  return httpServer;
}

// Trigger restart for debugging - updated
