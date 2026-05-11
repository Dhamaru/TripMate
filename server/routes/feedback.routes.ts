import { Router } from "express";
import { insertFeedbackSchema } from "@shared/schema";
import { storage } from "../storage";

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
    } catch (error) {
        next(error);
    }
});

export default router;
