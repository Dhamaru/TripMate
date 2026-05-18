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
router.get("/currency", toolsController.latestCurrency);
router.get("/currency/latest", toolsController.latestCurrency);
router.get("/currency/history", toolsController.currencyHistory);
router.get("/currency/convert", requireAuth, toolsController.convertCurrency);
router.get("/geocode", toolsController.geocode);
router.get("/reverse-geocode", toolsController.reverseGeocode);

// ─── Protected tool endpoints (auth required) ──────────────────────────────
router.get("/weather", requireAuth, toolsController.getWeather);
router.get("/weather/tiles/:layer/:z/:x/:y", requireAuth, toolsController.weatherProxy);
router.post("/translate", requireAuth, toolsController.translateText);
router.get("/emergency", requireAuth, toolsController.getEmergencyContacts);
router.post("/planTrip", requireAuth, toolsController.planTrip);
router.get("/proactive-insights", requireAuth, toolsController.getProactiveInsights);

export default router;
