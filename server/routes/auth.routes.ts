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
import { UserModel, SessionModel } from "@shared/schema";
import { imageFileFilter } from "../middleware/imageUpload";

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
        cb(null, `avatar-${(req.user as any)?._id || 'guest'}-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: imageFileFilter,
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
// User profile management - using /user to match frontend expectations
router.get("/user", requireAuth, authController.getProfile);
router.put("/user", requireAuth, authController.updateProfile);
router.get("/profile", requireAuth, authController.getProfile); // Compatibility
router.put("/profile", requireAuth, authController.updateProfile); // Compatibility

// Avatar upload
router.post("/user/avatar", requireAuth, upload.single("image"), authController.uploadAvatar);

// Google disconnect
router.post("/google/disconnect", requireAuth, async (req, res, next) => {
  try {
    const userId = (req.user as any)?._id || (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $unset: { googleId: 1 }, $set: { googleConnected: false } },
      { new: true }
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Settings & Security
router.post("/change-password", requireAuth, authController.changePassword);
router.put("/change-password", requireAuth, authController.changePassword); // Support both
router.get("/user/export", requireAuth, authController.exportUserData);
router.post("/delete-account", requireAuth, authController.deleteAccount);
router.delete("/delete-account", requireAuth, authController.deleteAccount); // Support both

router.get("/sessions", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any)?._id?.toString() || (req.user as any)?.id?.toString();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const currentSid = (req.user as any)?.sid;

    const sessions = await SessionModel.find({
      userId,
      revoked: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    res.json(sessions.map((s) => ({
      id: s.sessionId,
      userAgent: s.userAgent || null,
      ip: s.ip || null,
      device: s.device || null,
      expiresAt: s.expiresAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.sessionId === currentSid,
    })));
  } catch {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.post("/sessions/:id/revoke", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any)?._id?.toString() || (req.user as any)?.id?.toString();
    const currentSid = (req.user as any)?.sid;
    const { id } = req.params;

    const session = await SessionModel.findOne({ sessionId: id, userId });
    if (!session) return res.status(404).json({ error: "Session not found" });

    session.revoked = true;
    await session.save();

    // Revoking your own current session should also sign this browser out
    // right now, not just take effect on requireAuth's next check.
    if (id === currentSid) {
      res.clearCookie("token", { path: "/" });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to revoke session" });
  }
});

export default router;
