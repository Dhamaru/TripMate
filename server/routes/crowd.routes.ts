import { Router } from "express";
import * as crowdController from "../controllers/crowd.controller";
import { requireAuth, optionalAuth } from "../middleware/auth";

const router = Router();

// Publicly viewable heatmap, but only authenticated users can report? 
// Actually TripMap.tsx uses fetch without tokens for GET sometimes, but apiRequest for POST.
// We'll use optionalAuth for GET and requireAuth for POST.

router.get("/density", optionalAuth, crowdController.getDensity);
router.post("/density", requireAuth, crowdController.reportDensity);

// Debug route — development only
if (process.env.NODE_ENV !== "production") {
    router.post("/debug/seed", crowdController.seedCrowd);
}

export default router;
