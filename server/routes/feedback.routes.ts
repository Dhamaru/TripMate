import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertFeedbackSchema } from "@shared/schema";
import { storage } from "../storage";
import { sendFeedbackNotificationEmail, sendFeedbackConfirmationEmail } from "../email";

const router = Router();

const uploadDir = path.join(process.cwd(), "server", "uploads", "feedback");
const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `feedback-${unique}${path.extname(file.originalname)}`);
    },
});

const upload = multer({
    storage: diskStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 3 }, // 5MB each, up to 3 screenshots
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) cb(null, true);
        else cb(new Error("Only image attachments are allowed"));
    },
});

router.post("/", upload.array("attachments", 3), async (req, res, next) => {
    try {
        const userId = req.user ? (req.user as any).id || (req.user as any)._id : undefined;
        const attachments = (req.files as Express.Multer.File[] | undefined)?.map(
            (f) => `/uploads/feedback/${f.filename}`
        );
        const feedbackData = insertFeedbackSchema.parse({ ...req.body, attachments });

        const feedback = await storage.createFeedback({
            ...feedbackData,
            userId
        });

        console.log(`[Feedback] New ${feedback.type} submitted by ${feedback.email}`);
        res.status(201).json(feedback);

        // Fire-and-forget — don't make the submitter wait on email delivery.
        // This is the whole point of the feature (knowing when someone
        // reports something), so both directions matter: notify the site
        // owner, and confirm receipt to whoever submitted it.
        setImmediate(() => {
            sendFeedbackNotificationEmail(feedback).catch((e) => console.error("[Feedback] Admin notification failed:", e));
            sendFeedbackConfirmationEmail(feedback.email, feedback.subject, feedback.type).catch((e) => console.error("[Feedback] Submitter confirmation failed:", e));
        });
    } catch (error) {
        next(error);
    }
});

export default router;
