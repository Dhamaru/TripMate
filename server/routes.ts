import express, { type Express } from "express";
import { createServer, type Server } from "http";
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
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
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
  const useMemoryStore = !process.env.MONGODB_URI;
  const memoryUsers = new Map<string, { id: string; email: string; password: string; firstName?: string; lastName?: string; profileImageUrl?: string; phoneNumber?: string }>();
  const memorySessions = new Map<string, Array<{ sessionId: string; tokenHash: string; device?: string; ip?: string; userAgent?: string; expiresAt: number; revoked?: boolean }>>();
  const devMode = process.env.NODE_ENV !== 'production';
  const optionalAuth = (req: any, res: any, next: any) => devMode ? next() : isJwtAuthenticated(req, res, next);
  // Rate limiting (disabled globally to prevent app lockups; keep AI limits prod-only)

  app.get('/api/v1/weather/random-cities', optionalAuth, async (req: any, res) => {
    try {
      const key = process.env.WEATHER_API_KEY || '';
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

  if (!devMode) {
    // Removed global API limiter to avoid 429 lockups
  }

  // Auth middleware
  await setupAuth(app);

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

  // Auth routes - JWT only
  app.post('/api/v1/auth/signin', async (req, res) => {
    try {
      const { email, password, remember } = req.body || {};
      const ip = String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '')).split(',')[0];
      const key = `${String(email || '').toLowerCase()}|${ip}`;
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
        await new Promise(resolve => setTimeout(resolve, 300));
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password - use bcrypt for all users
      if (!user.password || !(await bcrypt.compare(password, user.password))) {
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

  app.post('/api/v1/auth/signup', async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      let existingUser;
      if (useMemoryStore) {
        existingUser = memoryUsers.get(email) as any;
      } else {
        existingUser = await storage.getUser(email);
      }
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      let user;
      if (useMemoryStore) {
        const id = email;
        memoryUsers.set(email, { id, email, password: hashedPassword, firstName, lastName, profileImageUrl: "", phoneNumber: "" });
        user = { id, email, firstName, lastName, profileImageUrl: "", phoneNumber: "" } as any;
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
      const trips = await storage.getUserTrips(userId);
      res.json(trips);
    } catch (error) {
      console.error("Error fetching trips:", error);
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  app.post('/api/v1/trips', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      // Convert budget string to number if provided
      const processedBody = {
        ...req.body,
        userId,
        budget: req.body.budget ? parseFloat(req.body.budget) : undefined
      };
      const tripData = insertTripSchema.parse(processedBody);
      const trip = await storage.createTrip(tripData);
      res.status(201).json(trip);
    } catch (error) {
      console.error("Error creating trip:", error);
      res.status(400).json({ message: "Invalid trip data" });
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
      const trip = await storage.updateTrip(tripId, userId, updates);
      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }
      res.json(trip);
    } catch (error) {
      console.error("Error updating trip:", error);
      res.status(400).json({ message: "Invalid trip data" });
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
      const entries = await storage.getUserJournalEntries(userId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching journal entries:", error);
      res.status(500).json({ message: "Failed to fetch journal entries" });
    }
  });

  app.post('/api/v1/journal', isJwtAuthenticated, upload.array('photos', 5), async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const photos = req.files ? req.files.map((file: any) => `/uploads/${file.filename}`) : [];
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

  app.put('/api/v1/journal/:id', isJwtAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims?.sub || req.user.id;
      const entryId = req.params.id;
      const updates = insertJournalEntrySchema.partial().parse(req.body);
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
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(key)}`,
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
      const key = process.env.WEATHER_API_KEY;
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
      const key = process.env.GOOGLE_PLACES_API_KEY;
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
          const q = `${t} near ${location}`;
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
          const j = await r.json();
          const first = Array.isArray(j) ? j[0] : undefined;
          if (first) {
            results.push({ id: `${t}-${results.length}`, name: first.display_name?.split(',')[0] || t, type: t, address: first.display_name || '', phone: '+1 (555) 000-0000', distance: '—', latitude: parseFloat(first.lat), longitude: parseFloat(first.lon) });
          }
        }
      }
      res.json(results);
    } catch (error) {
      console.error('Error fetching emergency services:', error);
      res.status(500).json({ message: 'Failed to fetch emergency services' });
    }
  });

  // New AI-only utility endpoints
  app.post('/api/v1/translate', optionalAuth, aiLimiter, async (req: any, res) => {
    try {
      const { text = '', sourceLang = 'en', targetLang = 'en' } = req.body || {};
      const body = { q: String(text), source: String(sourceLang), target: String(targetLang), format: 'text' };
      const r = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'TripMate/1.0' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        return res.status(502).json({ translatedText: '' });
      }
      const j = await r.json();
      const translatedText = String(j?.translatedText || j?.data?.translations?.[0]?.translatedText || '');
      return res.json({ translatedText, pronunciation: undefined });
    } catch (error) {
      console.error('AI translate error:', error);
      res.status(500).json({ translatedText: '', pronunciation: undefined });
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
      const lang = String(req.query.lang || 'en');
      const providerMode = String(process.env.WEATHER_PROVIDER || 'hybrid');
      const key = process.env.WEATHER_API_KEY;
      const iconMap: Record<string, string> = {
        Clear: 'fas fa-sun',
        Clouds: 'fas fa-cloud',
        Rain: 'fas fa-cloud-rain',
        Drizzle: 'fas fa-cloud-rain',
        Thunderstorm: 'fas fa-bolt',
        Snow: 'fas fa-snowflake',
        Mist: 'fas fa-smog',
        Fog: 'fas fa-smog',
        Wind: 'fas fa-wind',
      };

      const toDir = (deg: number) => {
        const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const i = Math.round(((deg % 360) / 22.5)) % 16;
        return dirs[i];
      };
      const oneCall = async (latNum: number, lonNum: number) => {
        if (!key) return null;
        const urlOneCall = `https://api.openweathermap.org/data/2.5/onecall?lat=${latNum}&lon=${lonNum}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}&appid=${key}`;
        const r = await fetch(urlOneCall);
        if (r.ok) {
          const j = await r.json();
          console.log('[weather:openweather:onecall]', { lat: latNum, lon: lonNum, units, lang, alerts: Array.isArray(j.alerts) ? j.alerts.length : 0 });
          const condMain = j.current?.weather?.[0]?.main || 'Clear';
          const day0 = Array.isArray(j.daily) && j.daily.length ? j.daily[0] : null;
          const tempMin = Math.round(day0?.temp?.min ?? Math.max(0, Math.round(j.current?.temp ?? 22) - 5));
          const tempMax = Math.round(day0?.temp?.max ?? Math.round(j.current?.temp ?? 22));
          const windDeg = Number(j.current?.wind_deg ?? 0);
          const current = {
            temperature: Math.round(j.current?.temp ?? 22),
            tempMin,
            tempMax,
            condition: condMain,
            humidity: Math.round(j.current?.humidity ?? 60),
            windSpeed: Math.round(j.current?.wind_speed ?? 10),
            windDeg,
            windDir: toDir(windDeg),
            icon: iconMap[condMain] || 'fas fa-cloud',
          };
          const forecast = Array.isArray(j.daily) ? j.daily.slice(0, 7).map((d: any, i: number) => {
            const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`;
            const main = d.weather?.[0]?.main || 'Clear';
            return { day: label, high: Math.round(d.temp?.max ?? current.temperature), low: Math.round(d.temp?.min ?? Math.max(0, current.temperature - 5)), condition: main, icon: iconMap[main] || 'fas fa-cloud' };
          }) : [];
          const hourly = Array.isArray(j.hourly) ? j.hourly.slice(0, 24).map((h: any) => {
            const dt = Number(h.dt ?? 0) * 1000;
            const hourLabel = new Date(dt).toLocaleTimeString(lang, { hour: 'numeric' });
            const main = h.weather?.[0]?.main || 'Clear';
            return { hour: hourLabel, temp: Math.round(h.temp ?? current.temperature), condition: main, icon: iconMap[main] || 'fas fa-cloud' };
          }) : [];
          const alerts = Array.isArray(j.alerts) ? j.alerts.map((a: any) => ({ event: a.event, description: a.description, start: a.start, end: a.end })) : [];
          const recommendations: string[] = [];
          if (current.temperature >= 30) recommendations.push('Stay hydrated');
          if (current.condition.includes('Rain')) recommendations.push('Carry a raincoat');
          recommendations.push('Use sunscreen during midday');
          return { current, forecast, hourly, alerts, recommendations, source: 'openweather' };
        }
        // Fallback path: use current weather + 5-day/3-hour forecast if One Call fails
        console.warn('[weather:onecall:fallback]', { lat: latNum, lon: lonNum, reason: r.status });
        const urlCurrent = `https://api.openweathermap.org/data/2.5/weather?lat=${latNum}&lon=${lonNum}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}&appid=${key}`;
        const urlForecast = `https://api.openweathermap.org/data/2.5/forecast?lat=${latNum}&lon=${lonNum}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(lang)}&appid=${key}`;
        const [rc, rf] = await Promise.allSettled([fetch(urlCurrent), fetch(urlForecast)]);
        if (rc.status !== 'fulfilled' || rf.status !== 'fulfilled' || !(rc.value as any).ok || !(rf.value as any).ok) {
          if (providerMode === 'strict') return null;
          try {
            const om = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
            if (om.ok) {
              const j = await om.json();
              const temp = Math.round(Number(j?.current?.temperature_2m ?? 22));
              const current = {
                temperature: temp,
                condition: 'Clear',
                humidity: Math.round(Number(j?.current?.relative_humidity_2m ?? 60)),
                windSpeed: Math.round(Number(j?.current?.wind_speed_10m ?? 10)),
                icon: 'fas fa-sun',
              };
              const days = Array.isArray(j?.daily?.time) ? j.daily.time : [];
              const highs = Array.isArray(j?.daily?.temperature_2m_max) ? j.daily.temperature_2m_max : [];
              const lows = Array.isArray(j?.daily?.temperature_2m_min) ? j.daily.temperature_2m_min : [];
              const forecast = days.slice(0, 7).map((d: string, i: number) => ({
                day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
                high: Math.round(Number(highs[i] ?? current.temperature)),
                low: Math.round(Number(lows[i] ?? Math.max(0, current.temperature - 5))),
                condition: 'Clear',
                icon: 'fas fa-sun',
              }));
              const hourlyTemps = Array.isArray(j?.hourly?.temperature_2m) ? j.hourly.temperature_2m : [];
              const hourlyTimes = Array.isArray(j?.hourly?.time) ? j.hourly.time : [];
              const hourly = hourlyTemps.slice(0, 24).map((t: number, idx: number) => ({
                hour: new Date(String(hourlyTimes[idx]).replace(' ', 'T')).toLocaleTimeString(lang, { hour: 'numeric' }),
                temp: Math.round(Number(t)),
                condition: 'Clear',
                icon: 'fas fa-sun',
              }));
              const recommendations: string[] = [];
              if (current.temperature >= 30) recommendations.push('Stay hydrated');
              recommendations.push('Use sunscreen during midday');
              return { current, forecast, hourly, alerts: [], recommendations, source: 'open-meteo' };
            }
          } catch { }
          return null;
        }
        const currentJson = await (rc.value as any).json();
        const forecastJson = await (rf.value as any).json();
        const condMain = currentJson?.weather?.[0]?.main || 'Clear';
        const windDeg = Number(currentJson?.wind?.deg ?? 0);
        const current = {
          temperature: Math.round(currentJson?.main?.temp ?? 22),
          tempMin: Math.round(currentJson?.main?.temp_min ?? Math.max(0, Math.round(currentJson?.main?.temp ?? 22) - 5)),
          tempMax: Math.round(currentJson?.main?.temp_max ?? Math.round(currentJson?.main?.temp ?? 22)),
          condition: condMain,
          humidity: Math.round(currentJson?.main?.humidity ?? 60),
          windSpeed: Math.round(currentJson?.wind?.speed ?? 10),
          windDeg,
          windDir: toDir(windDeg),
          icon: iconMap[condMain] || 'fas fa-cloud',
        };
        // Aggregate 3-hour forecast into daily high/low and main condition
        const daysMap: Record<string, { high: number; low: number; main: string }> = {};
        const list = Array.isArray(forecastJson?.list) ? forecastJson.list : [];
        list.forEach((item: any) => {
          const dtTxt = String(item?.dt_txt || '');
          const dayKey = dtTxt.slice(0, 10);
          const temp = Number(item?.main?.temp ?? current.temperature);
          const main = item?.weather?.[0]?.main || 'Clear';
          const d = daysMap[dayKey] || { high: -Infinity, low: Infinity, main };
          d.high = Math.max(d.high, temp);
          d.low = Math.min(d.low, temp);
          // Prefer non-Clear conditions when setting representative main
          if (d.main === 'Clear' && main !== 'Clear') d.main = main;
          daysMap[dayKey] = d;
        });
        const keys = Object.keys(daysMap).sort().slice(0, 7);
        const forecast = keys.map((k, i) => {
          const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`;
          const main = daysMap[k].main;
          return { day: label, high: Math.round(daysMap[k].high), low: Math.round(daysMap[k].low), condition: main, icon: iconMap[main] || 'fas fa-cloud' };
        });
        const hourly = list.slice(0, 24).map((item: any) => {
          const dtTxt = String(item?.dt_txt || '');
          const hourLabel = new Date(dtTxt.replace(' ', 'T')).toLocaleTimeString(lang, { hour: 'numeric' });
          const main = item?.weather?.[0]?.main || 'Clear';
          return { hour: hourLabel, temp: Math.round(item?.main?.temp ?? current.temperature), condition: main, icon: iconMap[main] || 'fas fa-cloud' };
        });
        const recommendations: string[] = [];
        if (current.temperature >= 30) recommendations.push('Stay hydrated');
        if (current.condition.includes('Rain')) recommendations.push('Carry a raincoat');
        recommendations.push('Use sunscreen during midday');
        return { current, forecast, hourly, alerts: [], recommendations, source: 'openweather' };
      }

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log('[weather:req]', { lat, lon, cityQ, units, lang, providerMode, hasKey: !!key });
        const oc = await oneCall(lat, lon);
        if (oc) return res.json(oc);
        // Final fallback when provider fails
        const now = new Date();
        const month = now.getMonth();
        const baseTemp = [20, 22, 26, 30, 32, 33, 32, 31, 30, 28, 24, 21][month] || 28;
        const current = { temperature: Math.round(baseTemp), humidity: 60, windSpeed: 10, condition: baseTemp >= 30 ? 'Sunny' : baseTemp >= 25 ? 'Partly Cloudy' : 'Cloudy', icon: 'fas fa-cloud-sun' };
        const forecast = Array.from({ length: 7 }, (_, i) => ({
          day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
          high: Math.round(baseTemp + (i % 3) - 1),
          low: Math.round(baseTemp - 5 + (i % 2)),
          condition: i % 4 === 0 ? 'Sunny' : i % 4 === 1 ? 'Partly Cloudy' : i % 4 === 2 ? 'Cloudy' : 'Rain',
          icon: 'fas fa-cloud-sun',
        }));
        const recommendations = [
          'Carry light cotton clothing',
          'Stay hydrated',
          'Use sunscreen during midday',
        ];
        return res.status(200).json({ current, forecast, recommendations, alerts: [], source: 'fallback-route' });
      }
      if (!cityQ) return res.status(400).json({ current: {}, forecast: [], recommendations: [], alerts: [] });
      
      // Use Open-Meteo geocoding (free, no API key needed)
      try {
        console.log('[weather:open-meteo-geocode] Searching for:', cityQ);
        const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQ)}&count=1&language=${encodeURIComponent(lang)}`;
        const geocodeRes = await fetch(geocodeUrl);
        
        if (geocodeRes.ok) {
          const geocodeData = await geocodeRes.json();
          const first = Array.isArray(geocodeData?.results) && geocodeData.results.length ? geocodeData.results[0] : null;
          
          if (first) {
            const latNum = Number(first.latitude);
            const lonNum = Number(first.longitude);
            
            if (Number.isFinite(latNum) && Number.isFinite(lonNum)) {
              console.log('[weather:open-meteo-geocode] Found:', first.name, { lat: latNum, lon: lonNum });
              
              // Fetch weather data from Open-Meteo
              const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
              const weatherRes = await fetch(weatherUrl);
              
              if (weatherRes.ok) {
                const weatherData = await weatherRes.json();
                const temp = Math.round(Number(weatherData?.current?.temperature_2m ?? 22));
                
                const current = {
                  temperature: temp,
                  condition: 'Clear',
                  humidity: Math.round(Number(weatherData?.current?.relative_humidity_2m ?? 60)),
                  windSpeed: Math.round(Number(weatherData?.current?.wind_speed_10m ?? 10)),
                  icon: 'fas fa-sun',
                };
                
                const days = Array.isArray(weatherData?.daily?.time) ? weatherData.daily.time : [];
                const highs = Array.isArray(weatherData?.daily?.temperature_2m_max) ? weatherData.daily.temperature_2m_max : [];
                const lows = Array.isArray(weatherData?.daily?.temperature_2m_min) ? weatherData.daily.temperature_2m_min : [];
                
                const forecast = days.slice(0, 7).map((d: string, i: number) => ({
                  day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
                  high: Math.round(Number(highs[i] ?? temp)),
                  low: Math.round(Number(lows[i] ?? Math.max(0, temp - 5))),
                  condition: 'Clear',
                  icon: 'fas fa-sun',
                }));
                
                console.log('[weather:open-meteo] Success for', cityQ);
                return res.json({ current, forecast, hourly: [], alerts: [], recommendations: [], source: 'open-meteo' });
              }
            }
          }
        }
      } catch (e) {
        console.error('[weather:open-meteo-geocode] Error:', e);
      }
      
      // Fallback to AI-generated weather
      const result = await ai.weather(cityQ);
      console.log('[weather:ai]', { cityQ, units, lang });
      res.json({ ...result, alerts: [] });
    } catch (error) {
      console.error('weather route error:', error);
      const now = new Date();
      const month = now.getMonth();
      const baseTemp = [20, 22, 26, 30, 32, 33, 32, 31, 30, 28, 24, 21][month] || 28;
      const current = { temperature: Math.round(baseTemp), humidity: 60, windSpeed: 10, condition: baseTemp >= 30 ? "Sunny" : baseTemp >= 25 ? "Partly Cloudy" : "Cloudy" };
      const forecast = Array.from({ length: 7 }, (_, i) => ({
        day: i === 0 ? "Today" : i === 1 ? "Tomorrow" : `Day ${i + 1}`,
        high: Math.round(baseTemp + (i % 3) - 1),
        low: Math.round(baseTemp - 5 + (i % 2)),
        condition: i % 4 === 0 ? "Sunny" : i % 4 === 1 ? "Partly Cloudy" : i % 4 === 2 ? "Cloudy" : "Rain",
      }));
      const recommendations = [
        "Carry light cotton clothing",
        "Stay hydrated",
        "Use sunscreen during midday",
        "Check local advisories for heat or rain",
      ];
      res.status(200).json({ current, forecast, recommendations, alerts: [], source: 'fallback-route' });
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

  app.get('/api/v1/emergency', optionalAuth, aiLimiter, async (req: any, res) => {
    try {
      const locRaw = String(req.query.location || req.query.city || '').trim();
      if (!locRaw) return res.status(400).json([]);

      const coordMatch = locRaw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (!coordMatch) {
        const byText = await ai.emergency(locRaw);
        return res.json(byText);
      }

      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      const delta = 0.08; // ~9km bbox
      const left = (lon - delta).toFixed(6);
      const right = (lon + delta).toFixed(6);
      const top = (lat + delta).toFixed(6);
      const bottom = (lat - delta).toFixed(6);

      let countryCode = 'xx';
      let countryName = '';
      try {
        const rev = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
          { headers: { 'User-Agent': 'TripMate/1.0 (+https://example.com)', 'Accept-Language': 'en' } });
        const j = await rev.json();
        countryCode = String(j?.address?.country_code || 'xx').toUpperCase();
        countryName = String(j?.address?.country || '');
      } catch { }

      const types = ['hospital', 'police', 'embassy', 'pharmacy'] as const;
      const results: Array<{ id: string; name: string; type: string; address: string; phone: string; distance: string; latitude: number; longitude: number }> = [];
      for (const t of types) {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(t)}&viewbox=${left},${top},${right},${bottom}&bounded=1`;
          const r = await fetch(url, { headers: { 'User-Agent': 'TripMate/1.0 (+https://example.com)', 'Accept-Language': 'en' } });
          const j = await r.json();
          const arr = Array.isArray(j) ? j : [];
          for (let i = 0; i < Math.min(arr.length, 3); i++) {
            const it: any = arr[i];
            const name = String(it.display_name?.split(',')[0] || t);
            const address = String(it.display_name || '');
            const latitude = parseFloat(it.lat);
            const longitude = parseFloat(it.lon);
            const phone = t === 'police' ? mapEmergencyNumber(countryCode, 'police') : t === 'hospital' ? mapEmergencyNumber(countryCode, 'medical') : t === 'embassy' ? '' : mapEmergencyNumber(countryCode, 'pharmacy');
            results.push({ id: `${t}-${i}`, name, type: t, address, phone, distance: '—', latitude, longitude });
          }
        } catch { }
      }

      // compute distances and sort
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
      const sortedLimited = withDist.slice(0, 10);
      if (!sortedLimited.length) {
        const fallback = await ai.emergency(`${countryName || countryCode}`);
        return res.json(fallback);
      }
      return res.json(sortedLimited);
    } catch (error) {
      console.error('AI emergency error:', error);
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

  app.post('/api/tools/weather', isJwtAuthenticated, aiLimiter, async (req: any, res) => {
    const location = String(req.body?.location || '').trim();
    const coords = req.body?.coords;
    const units = String(req.body?.units || 'metric');
    const lang = String(req.body?.lang || 'en');
    const userId = req.user?.claims?.sub || req.user?.id || 'anon';
    const ts = new Date().toISOString();
    try {
      const providerMode = String(process.env.WEATHER_PROVIDER || 'hybrid');
      const key = process.env.WEATHER_API_KEY || '';
      const keyInvalid = !!key && String(key).startsWith('AIza');
      const useOpenWeather = !!key && !keyInvalid && providerMode !== 'open_meteo';

      const iconMap: Record<string, string> = {
        Clear: 'fas fa-sun',
        Clouds: 'fas fa-cloud',
        Rain: 'fas fa-cloud-rain',
        Drizzle: 'fas fa-cloud-rain',
        Thunderstorm: 'fas fa-bolt',
        Snow: 'fas fa-snowflake',
        Mist: 'fas fa-smog',
        Fog: 'fas fa-smog',
        Wind: 'fas fa-wind',
      };

      const fetchOM = async (latNum: number, lonNum: number) => {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latNum}&longitude=${lonNum}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
        if (!r.ok) return null;
        const j = await r.json();
        const temp = Math.round(Number(j?.current?.temperature_2m ?? 22));
        const current = {
          temperature: temp,
          condition: 'Clear',
          humidity: Math.round(Number(j?.current?.relative_humidity_2m ?? 60)),
          windSpeed: Math.round(Number(j?.current?.wind_speed_10m ?? 10)),
          icon: 'fas fa-sun',
        };
        const days = Array.isArray(j?.daily?.time) ? j.daily.time : [];
        const highs = Array.isArray(j?.daily?.temperature_2m_max) ? j.daily.temperature_2m_max : [];
        const lows = Array.isArray(j?.daily?.temperature_2m_min) ? j.daily.temperature_2m_min : [];
        const forecast = days.slice(0, 7).map((d: string, i: number) => ({
          day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`,
          high: Math.round(Number(highs[i] ?? temp)),
          low: Math.round(Number(lows[i] ?? Math.max(0, temp - 5))),
          condition: 'Clear',
          icon: 'fas fa-sun',
        }));
        return { current, forecast, source: 'open-meteo' };
      };

      const geocodeCity = async (q: string): Promise<{ lat: number; lon: number } | null> => {
        if (useOpenWeather) {
          const g = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${key}`);
          if (g.ok) {
            const arr = await g.json();
            const first = Array.isArray(arr) && arr.length ? arr[0] : null;
            if (first && Number.isFinite(first.lat) && Number.isFinite(first.lon)) return { lat: Number(first.lat), lon: Number(first.lon) };
          }
        }
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=1`, { headers: { 'User-Agent': 'TripMate/1.0 (+https://example.com)', 'Accept-Language': lang } });
          if (r.ok) {
            const arr = await r.json();
            const first = Array.isArray(arr) && arr.length ? arr[0] : null;
            const latNum = Number(String(first?.lat || ''));
            const lonNum = Number(String(first?.lon || ''));
            if (Number.isFinite(latNum) && Number.isFinite(lonNum)) return { lat: latNum, lon: lonNum };
          }
        } catch { }
        try {
          const r2 = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=${encodeURIComponent(lang)}`);
          if (r2.ok) {
            const j2 = await r2.json();
            const first = Array.isArray(j2?.results) && j2.results.length ? j2.results[0] : null;
            const latNum = Number(first?.latitude ?? NaN);
            const lonNum = Number(first?.longitude ?? NaN);
            if (Number.isFinite(latNum) && Number.isFinite(lonNum)) return { lat: latNum, lon: lonNum };
          }
        } catch { }
        return null;
      };

      const maskedLocation = location.replace(/\d/g, 'x');
      console.log(JSON.stringify({ ts, tool: 'weather', user: String(userId).slice(0, 6) + '…', input: { location: maskedLocation, coords: coords && { lat: coords?.lat, lon: coords?.lon } } }));

      let userWeather: any = null;
      const latUser = Number(coords?.lat);
      const lonUser = Number(coords?.lon);
      if (Number.isFinite(latUser) && Number.isFinite(lonUser)) {
        userWeather = await fetchOM(latUser, lonUser);
      }

      let searchWeather: any = null;
      if (location) {
        const geo = await geocodeCity(location);
        if (geo) searchWeather = await fetchOM(geo.lat, geo.lon);
      }

      if (!userWeather && !searchWeather) {
        return res.status(400).json({ error: 'invalid_input', message: 'invalid or missing inputs' });
      }
      res.json({ user: userWeather, searched: searchWeather });
    } catch (err) {
      res.status(500).json({ error: 'tool_error', message: 'Unexpected error' });
    }
  });

  // Simple test route to validate weather tool in isolation
  app.post('/api/tools/weather/test', async (req: any, res) => {
    try {
      const location = String(req.body?.location || 'Mumbai, India');
      const result = await ai.weatherTool(location);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'tool_error', message: 'Unexpected error' });
    }
  });

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
        typeOfTrip: z.string().min(2),
        travelMedium: z.string().min(2),
        preferences: z.string().optional(),
      });
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(422).json({ error: 'invalid_input', details: parsed.error.issues });
      }
      const { destination, days, persons, budget, typeOfTrip, travelMedium } = parsed.data;
      const ts = new Date().toISOString();
      console.log(JSON.stringify({ ts, endpoint: '/api/v1/trips/generate-itinerary', dest: destination.slice(0, 16) + '…', days, persons, budget: typeof budget === 'number' ? 'n' : '—', typeOfTrip, travelMedium }));
      const inflightKey = `compat:${destination}:${days}:${persons}:${budget ?? 'x'}:${typeOfTrip}:${travelMedium}`;
      const inflight = (app.locals as any).inflightCompatPlan || new Map<string, Promise<any>>();
      (app.locals as any).inflightCompatPlan = inflight;
      let task = inflight.get(inflightKey);
      if (!task) {
        task = ai.planTrip({ destination, days, persons, budget, typeOfTrip, travelMedium });
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

      const cache: Map<string, { ts: number; value: any }> = (req.app.locals as any).geocodeCache || new Map();
      (req.app.locals as any).geocodeCache = cache;
      const TTL = 10 * 60 * 1000;
      const cached = cache.get(sanitized);
      if (cached && (Date.now() - cached.ts) < TTL) {
        return res.json(cached.value);
      }

      let results: any[] = [];

      // Try Google Places API first
      const googleKey = process.env.GOOGLE_PLACES_API_KEY;
      if (googleKey) {
        try {
          const googleUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(sanitized)}&language=en&key=${googleKey}`;
          const googleRes = await fetch(googleUrl);
          const googleData = await googleRes.json();

          if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
            results = googleData.results.slice(0, 5).map((place: any) => ({
              name: place.name || '',
              lat: place.geometry?.location?.lat || 0,
              lon: place.geometry?.location?.lng || 0,
              display_name: place.formatted_address || place.name || '',
              state: '',
              country: '',
              source: 'google'
            }));
            cache.set(sanitized, { ts: Date.now(), value: results });
            return res.json(results);
          }
        } catch (err) {
          console.error('Google Places API error:', err);
          // Fall through to OpenWeather
        }
      }

      // Fallback to OpenWeather if Google failed or not configured
      const weatherKey = process.env.WEATHER_API_KEY;
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
            cache.set(sanitized, { ts: Date.now(), value: results });
            return res.json(results);
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
          cache.set(sanitized, { ts: Date.now(), value: results });
          return res.json(results);
        }
      } catch (err) {
        console.error('Nominatim geocode error:', err);
      }

      return res.status(404).json({ error: 'Location not found' });
    } catch (error) {
      console.error('Geocode error:', error);
      return res.status(500).json({ error: 'geocode failed' });
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
            list = gres.slice(0, limitFetch).map((it: any) => ({
              osm_id: String(it.place_id || `${it.name || 'place'}-${Math.random()}`),
              namedetails: { 'name:en': String(it.name || ''), name: String(it.name || '') },
              address: { city: '', state: '', country: '', road: '' },
              lat: Number(it.geometry?.location?.lat ?? 0),
              lon: Number(it.geometry?.location?.lng ?? 0),
              display_name: String(it.formatted_address || it.name || ''),
              source: 'google',
            }));
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
          list = Array.isArray(arr) ? arr : [];
          cache.set(cacheKey, { ts: now, value: list });
        }
      }

      // Fallback: if Nominatim found nothing and we have weather key, try OpenWeather Direct Geocoding (city-level)
      if (Array.isArray(list) && list.length === 0) {
        const key = process.env.WEATHER_API_KEY || '';
        if (key) {
          try {
            const ro = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${Math.max(5, autocomplete ? 5 : 10)}&appid=${key}`);
            const jo = await ro.json().catch(() => []);
            if (Array.isArray(jo) && jo.length) {
              list = jo.map((o: any) => ({
                osm_id: `${o.lat}-${o.lon}-${o.name}`,
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
  app.get('/api/v1/reverse-geocode', optionalAuth, async (req: any, res) => {
    try {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat_lon_required' });
      const key = process.env.WEATHER_API_KEY;
      if (!key) return res.status(503).json({ error: 'weather api key missing' });

      const cache: Map<string, { ts: number; value: any }> = (req.app.locals as any).revGeocodeCache || new Map();
      (req.app.locals as any).revGeocodeCache = cache;
      const TTL = 10 * 60 * 1000;
      const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      const cached = cache.get(k);
      if (cached && (Date.now() - cached.ts) < TTL) {
        return res.json(cached.value);
      }

      const r = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&limit=1&appid=${key}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = String((j as any)?.message || 'reverse geocode failed');
        return res.status(r.status).json({ error: msg });
      }
      const list = await r.json();
      const first = Array.isArray(list) && list.length ? list[0] : null;
      if (!first) return res.status(404).json({ error: 'not_found' });
      const name = String((first.local_names && (first.local_names.en || first.local_names['en'])) || first.name || '').trim();
      const state = String(first.state || '').trim();
      const country = String(first.country || '').trim();
      const payload = { name, state, country, lat, lon, displayName: [name, state, country].filter(Boolean).join(', ') };
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

      const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
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
      try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        const typeEmoji = type === 'bug' ? '🐛' : type === 'feature' ? '✨' : type === 'feedback' ? '💡' : '📝';

        await transporter.sendMail({
          from: `"TripMate Feedback" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
          to: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
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
      } catch (emailError) {
        console.error('Failed to send feedback email:', emailError);
        // Continue even if email fails
      }

      res.json({ success: true, message: 'Feedback submitted successfully' });
    } catch (error) {
      console.error('Feedback submission error:', error);
      res.status(500).json({ message: 'Failed to submit feedback' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Trigger restart for debugging - updated
