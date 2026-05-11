import { Router } from "express";
import * as agentController from "../controllers/agent.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// All Atlas/Agent routes require auth
router.use(requireAuth);

router.post("/agent/chat", agentController.chat);
router.get("/agent/history/:tripId", agentController.getHistory);
router.delete("/agent/history/:tripId", agentController.clearHistory);

export default router;
