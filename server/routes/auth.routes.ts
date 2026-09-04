import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { getCsrfToken } from "../middleware/csrf.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";
import {
  signInSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schemas/auth.schemas";
import passport from "passport";
import { config as appConfig } from "../config";
import multer from "multer";
import { UserModel, SessionModel } from "@shared/schema";
import { imageFileFilter } from "../middleware/imageUpload";

const router = Router();

// Avatars are stored as a base64 data URI directly on the User document
// (see uploadAvatar in auth.controller.ts) rather than written to disk —
// Render's web service filesystem is ephemeral, wiped on every redeploy
// and on spin-down after 15 minutes idle (the free/standard tier's normal
// behavior), so a disk-backed avatar reliably vanished on the next deploy
// or after any period of inactivity. MongoDB is the one thing in this
// stack that's actually persistent. memoryStorage keeps the upload in
// req.file.buffer instead of writing it anywhere.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: imageFileFilter,
});

// Public routes
router.get("/csrf", getCsrfToken);
router.post("/signup", authLimiter, validate(signUpSchema), authController.signup);
router.post("/signin", authLimiter, validate(signInSchema), authController.signin);
router.post("/guest", authLimiter, authController.guestSignin);
router.post("/signout", authController.signout);
router.post(
  "/forgot-password",
  authLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);

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
    // Was passport.authenticate("google", { failureRedirect:
    // "/signin?error=auth_failed" }) — passport's built-in failureRedirect
    // only ever looks at whether `user` came back truthy, so the specific
    // reason the Google strategy's callback passed (via `info`) for
    // refusing to auto-link a Google identity onto an existing password
    // account (see server/auth.ts) was silently discarded. Every failure
    // — a real password-account collision, a network blip, a user who hit
    // Cancel on Google's consent screen — landed on the same generic
    // "auth_failed", so a user in that specific, recoverable case (sign
    // in with your password instead) had no way to learn that and no path
    // forward. A custom callback lets the specific `info.message` from
    // that refusal pick a distinct, actionable error code.
    passport.authenticate("google", { session: false }, (err: any, user: any, info: any) => {
      if (err) return res.redirect("/signin?error=auth_failed");
      if (!user) {
        const code =
          info?.message && /already has a password/i.test(info.message)
            ? "google_link_password_exists"
            : "auth_failed";
        return res.redirect(`/signin?error=${code}`);
      }
      req.user = user;
      return next();
    })(req, res, next);
  },
  authController.googleCallback,
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
      { new: true },
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

    res.json(
      sessions.map((s) => ({
        id: s.sessionId,
        userAgent: s.userAgent || null,
        ip: s.ip || null,
        device: s.device || null,
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        isCurrent: s.sessionId === currentSid,
      })),
    );
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
