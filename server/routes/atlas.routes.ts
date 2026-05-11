import { Router } from "express";
import * as agentController from "../controllers/agent.controller";
import { requireAuth } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate";
import { agentMessageSchema } from "../schemas/agent.schemas";

const router = Router();

router.use(requireAuth);

router.post("/agent/chat", aiLimiter, validate(agentMessageSchema), agentController.chat);
router.get("/agent/history/:tripId", agentController.getHistory);
router.delete("/agent/history/:tripId", agentController.clearHistory);

export default router;
