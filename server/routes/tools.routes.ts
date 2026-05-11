import { Router } from "express";
import * as toolsController from "../controllers/tools.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ─── Public health & tools endpoints (NO auth required) ────────────────────
router.get("/health", toolsController.health);
router.get("/ping", toolsController.ping);
router.get("/liveness", toolsController.liveness);
router.get("/readiness", toolsController.readiness);
router.get("/version", toolsController.version);
router.get("/currency/latest", toolsController.latestCurrency);
router.get("/geocode", toolsController.geocode);

// ─── Protected tool endpoints (auth required) ──────────────────────────────
router.get("/tools/weather/tiles/:layer/:z/:x/:y", requireAuth, toolsController.weatherProxy);
router.get("/tools/proactive-insights", requireAuth, toolsController.getProactiveInsights);

export default router;
