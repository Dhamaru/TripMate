import { Router } from "express";
import { insertFeedbackSchema } from "@shared/schema";
import { storage } from "../storage";
import { sendFeedbackNotificationEmail, sendFeedbackConfirmationEmail } from "../email";

const router = Router();

router.post("/", async (req, res, next) => {
    try {
        const userId = req.user ? (req.user as any).id || (req.user as any)._id : undefined;
        const feedbackData = insertFeedbackSchema.parse(req.body);

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
