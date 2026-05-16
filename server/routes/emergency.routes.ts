import { Router } from "express";
import * as toolsController from "../controllers/tools.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, toolsController.getEmergencyContacts);
router.get("/:query?", requireAuth, toolsController.getEmergencyContacts);

export default router;
