import { Router } from "express";
import * as toolsController from "../controllers/tools.controller";
import { requireAuth } from "../middleware/auth";
import { apiProxyLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

router.use(apiProxyLimiter);

router.get("/", requireAuth, toolsController.getWeather);
router.get("/forecast", requireAuth, toolsController.getWeather); // Fallback or dedicated forecast
router.get("/tiles/:layer/:z/:x/:y", requireAuth, toolsController.weatherProxy);

export default router;
