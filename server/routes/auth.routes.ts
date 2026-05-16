import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { getCsrfToken } from "../middleware/csrf.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { signInSchema, signUpSchema } from "../schemas/auth.schemas";
import passport from "passport";
import { config as appConfig } from "../config";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";

const router = Router();

// Configure multer for avatar uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), "server", "uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `avatar-${(req.user as any)?._id || 'guest'}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only images are allowed"));
        }
    }
});

// Public routes
router.get("/csrf", getCsrfToken);
router.post("/signup", authLimiter, validate(signUpSchema), authController.signup);
router.post("/signin", authLimiter, validate(signInSchema), authController.signin);
router.post("/guest", authLimiter, authController.guestSignin);
router.post("/signout", authController.signout);
router.post("/forgot-password", authLimiter, authController.forgotPassword);
router.post("/reset-password", authLimiter, authController.resetPassword);

router.get("/providers", (_req, res) => {
  res.json({ google: !!(appConfig.GOOGLE_CLIENT_ID && appConfig.GOOGLE_CLIENT_SECRET) });
});

router.get("/google", (req, res, next) => {
  if (!appConfig.GOOGLE_CLIENT_ID || !appConfig.GOOGLE_CLIENT_SECRET) {
    return res.redirect("/signin?error=google_not_configured");
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});
router.get(
  "/google/callback",
  (req, res, next) => {
    if (!appConfig.GOOGLE_CLIENT_ID || !appConfig.GOOGLE_CLIENT_SECRET) {
      return res.redirect("/signin?error=google_not_configured");
    }
    passport.authenticate("google", { session: false, failureRedirect: "/signin?error=auth_failed" })(req, res, next);
  },
  authController.googleCallback
);

// Protected routes
router.get("/profile", requireAuth, authController.getProfile);
router.put("/profile", requireAuth, authController.updateProfile);
router.put("/change-password", requireAuth, authController.changePassword);

// Fix: Match frontend route /api/v1/auth/user/avatar and handle file upload
router.post("/user/avatar", requireAuth, upload.single("image"), authController.uploadAvatar);

// Legacy/Alternative route
router.post("/upload-avatar", requireAuth, authController.uploadAvatar);

router.post("/delete-account", requireAuth, authController.deleteAccount);

router.get("/sessions", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any)?._id?.toString() || (req.user as any)?.id?.toString();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Try MongoDB sessions first (session-based auth)
    const col = mongoose.connection.db?.collection("sessions");
    let result: any[] = [];
    if (col) {
      const docs = await col.find({}).toArray();
      result = docs
        .map((doc: any) => {
          try {
            const s = typeof doc.session === "string" ? JSON.parse(doc.session) : doc.session;
            const passportUser = s?.passport?.user;
            if (!passportUser || passportUser !== userId) return null;
            return {
              id: doc._id?.toString(),
              userAgent: req.headers["user-agent"] || null,
              ip: req.ip || null,
              device: null,
              expiresAt: doc.expires?.toISOString() || null,
              isCurrent: req.sessionID === doc._id?.toString(),
            };
          } catch { return null; }
        })
        .filter(Boolean);
    }

    // JWT-auth users have no session row — return synthetic current session
    if (result.length === 0) {
      result = [{
        id: "current",
        userAgent: req.headers["user-agent"] || null,
        ip: req.ip || null,
        device: null,
        expiresAt: null,
        isCurrent: true,
      }];
    }

    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.post("/sessions/:id/revoke", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any)?._id?.toString() || (req.user as any)?.id?.toString();
    const { id } = req.params;
    // Synthetic JWT session — nothing to delete in DB
    if (id === "current") return res.json({ ok: true });
    const col = mongoose.connection.db?.collection("sessions");
    if (!col) return res.status(500).json({ error: "Session store unavailable" });
    const doc = await col.findOne({ _id: id as any });
    if (!doc) return res.status(404).json({ error: "Session not found" });
    const s = typeof doc.session === "string" ? JSON.parse(doc.session) : doc.session;
    if (s?.passport?.user !== userId) return res.status(403).json({ error: "Forbidden" });
    await col.deleteOne({ _id: id as any });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to revoke session" });
  }
});

export default router;
