import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { getCsrfToken } from "../middleware/csrf.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { signInSchema, signUpSchema } from "../schemas/auth.schemas";
import passport from "passport";
import multer from "multer";
import path from "path";
import fs from "fs";

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

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", authController.googleCallback);

// Protected routes
router.get("/profile", requireAuth, authController.getProfile);
router.put("/profile", requireAuth, authController.updateProfile);
router.put("/change-password", requireAuth, authController.changePassword);

// Fix: Match frontend route /api/v1/auth/user/avatar and handle file upload
router.post("/user/avatar", requireAuth, upload.single("image"), authController.uploadAvatar);

// Legacy/Alternative route
router.post("/upload-avatar", requireAuth, authController.uploadAvatar);

router.post("/delete-account", requireAuth, authController.deleteAccount);

export default router;
