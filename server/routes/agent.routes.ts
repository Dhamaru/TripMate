import { Router } from "express";
import { chat, stream, getHistory, clearHistory } from "../controllers/agent.controller";
import { requireAuth } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

router.post("/chat", requireAuth, aiLimiter, chat);
// SSE stream endpoint
router.get("/chat/stream", requireAuth, aiLimiter, stream);
router.get("/history/:tripId", requireAuth, getHistory);
router.delete("/history/:tripId", requireAuth, clearHistory);

export default router;
