import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { insertFeedbackSchema, FeedbackModel } from "@shared/schema";
import { storage } from "../storage";
import {
  sendFeedbackNotificationEmail,
  sendFeedbackConfirmationEmail,
  sendAgentTriagePlanEmail,
} from "../email";
import { requireAdminSecret } from "../middleware/adminAuth.middleware";
import { NotFoundError, BadRequestError } from "../errors";
import { imageFileFilter } from "../middleware/imageUpload";

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
  fileFilter: imageFileFilter,
});

router.post("/", upload.array("attachments", 3), async (req, res, next) => {
  try {
    const userId = req.user ? (req.user as any).id || (req.user as any)._id : undefined;
    // Served through the admin-only proxy below, not the old
    // unauthenticated /uploads static mount. Nothing in the client ever
    // reads these back — they exist only for the triage routine/admin
    // review — so gating behind requireAdminSecret (the same auth the
    // routine already uses) rather than requireAuth is correct here.
    const attachments = (req.files as Express.Multer.File[] | undefined)?.map(
      (f) => `/api/v1/feedback/attachment/${f.filename}`,
    );
    const feedbackData = insertFeedbackSchema.parse({ ...req.body, attachments });

    const feedback = await storage.createFeedback({
      ...feedbackData,
      userId,
    });

    console.log(`[Feedback] New ${feedback.type} submitted by ${feedback.email}`);
    res.status(201).json(feedback);

    // Fire-and-forget — don't make the submitter wait on email delivery.
    // This is the whole point of the feature (knowing when someone
    // reports something), so both directions matter: notify the site
    // owner, and confirm receipt to whoever submitted it.
    setImmediate(() => {
      sendFeedbackNotificationEmail(feedback).catch((e) =>
        console.error("[Feedback] Admin notification failed:", e),
      );
      sendFeedbackConfirmationEmail(feedback.email, feedback.subject, feedback.type).catch((e) =>
        console.error("[Feedback] Submitter confirmation failed:", e),
      );
    });
  } catch (error) {
    next(error);
  }
});

// ─── Admin/automation endpoints — secret-header auth, not user login ──────
// Used by the scheduled feedback-triage routine to find new reports and
// record what it found. Deliberately read/annotate only: the routine drafts
// a fix plan here, it never touches application code directly.

router.get("/attachment/:filename", requireAdminSecret, (req, res, next) => {
  const filename = req.params.filename;
  if (!filename || /[\\/]|\.\./.test(filename)) {
    return next(new NotFoundError("Attachment not found"));
  }
  const filePath = path.join(uploadDir, filename);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) next(new NotFoundError("Attachment not found"));
  });
});

router.get("/", requireAdminSecret, async (req, res, next) => {
  try {
    const filter: Record<string, unknown> = {};
    // Mongoose's `default: false` on agentReviewed only applies when
    // hydrating a fetched document into a JS object — it does NOT
    // backfill the raw stored document, and Mongo's own query matching
    // doesn't know about schema defaults. { agentReviewed: false } alone
    // misses every doc created before this field existed (the field is
    // absent, not `false`), which meant the triage routine's first
    // "successful" run found nothing even with real unreviewed feedback
    // sitting there. $ne: true catches both false and missing.
    if (req.query.unreviewed === "true") filter.agentReviewed = { $ne: true };
    if (req.query.type) filter.type = req.query.type;

    const feedback = await FeedbackModel.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(feedback);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/review", requireAdminSecret, async (req, res, next) => {
  try {
    const { plan } = req.body as { plan?: string };
    if (!plan || !plan.trim()) throw new BadRequestError("plan is required");

    const feedback = await FeedbackModel.findByIdAndUpdate(
      req.params.id,
      { agentReviewed: true, agentReviewedAt: new Date(), agentPlan: plan },
      { new: true },
    );
    if (!feedback) throw new NotFoundError("Feedback not found");

    res.json(feedback);

    setImmediate(() => {
      sendAgentTriagePlanEmail(feedback).catch((e) =>
        console.error("[Feedback] Triage-plan notification failed:", e),
      );
    });
  } catch (error) {
    next(error);
  }
});

export default router;
