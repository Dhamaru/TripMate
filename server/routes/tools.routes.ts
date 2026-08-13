import { Router } from "express";
import * as toolsController from "../controllers/tools.controller";
import { requireAuth } from "../middleware/auth";
import { generationLimiter, aiLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

// ─── Public health & tools endpoints (NO auth required) ────────────────────

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Server + DB health check
 *     responses:
 *       200:
 *         description: ok or degraded
 */
router.get("/health", toolsController.health);

/**
 * @swagger
 * /atlas/health:
 *   get:
 *     tags: [Health]
 *     summary: Atlas AI provider circuit-breaker status — which providers are currently healthy
 *     responses:
 *       200:
 *         description: ok or degraded
 */
router.get("/atlas/health", toolsController.atlasHealth);

/**
 * @swagger
 * /ping:
 *   get:
 *     tags: [Health]
 *     summary: Liveness ping
 *     responses:
 *       200:
 *         description: pong
 */
router.get("/ping", toolsController.ping);
router.get("/liveness", toolsController.liveness);
router.get("/readiness", toolsController.readiness);
router.get("/version", toolsController.version);

/**
 * @swagger
 * /currency:
 *   get:
 *     tags: [AI Tools]
 *     summary: Latest exchange rates or single conversion
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string }
 *         description: Base currency (default USD)
 *       - in: query
 *         name: to
 *         schema: { type: string }
 *         description: Target currency — if omitted returns all rates
 *       - in: query
 *         name: amount
 *         schema: { type: number }
 *         description: Amount to convert (default 1)
 *     responses:
 *       200:
 *         description: Rate and converted amount
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CurrencyResponse'
 */
router.get("/currency", toolsController.latestCurrency);
router.get("/currency/latest", toolsController.latestCurrency);

/**
 * @swagger
 * /currency/history:
 *   get:
 *     tags: [AI Tools]
 *     summary: Historical exchange rate series (7–90 days)
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string }
 *       - in: query
 *         name: to
 *         schema: { type: string }
 *       - in: query
 *         name: days
 *         schema: { type: integer, minimum: 7, maximum: 90 }
 *     responses:
 *       200:
 *         description: Array of { date, rate }
 */
router.get("/currency/history", toolsController.currencyHistory);

/**
 * @swagger
 * /currency/convert:
 *   get:
 *     tags: [AI Tools]
 *     summary: AI-assisted currency conversion
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: amount
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: from
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: to
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Conversion result
 */
router.get("/currency/convert", requireAuth, toolsController.convertCurrency);

/**
 * @swagger
 * /geocode:
 *   get:
 *     tags: [AI Tools]
 *     summary: Forward geocode a place name
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Place name to geocode
 *     responses:
 *       200:
 *         description: Array of Nominatim results
 */
router.get("/geocode", toolsController.geocode);

/**
 * @swagger
 * /reverse-geocode:
 *   get:
 *     tags: [AI Tools]
 *     summary: Reverse geocode lat/lon to address
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lon
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: Nominatim address object
 */
router.get("/reverse-geocode", toolsController.reverseGeocode);

// ─── Protected tool endpoints (auth required) ──────────────────────────────

/**
 * @swagger
 * /weather:
 *   get:
 *     tags: [AI Tools]
 *     summary: 7-day weather forecast for a city or coordinates
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *         description: City name (or use lat/lon)
 *       - in: query
 *         name: lat
 *         schema: { type: number }
 *       - in: query
 *         name: lon
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: Weather data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WeatherResponse'
 */
router.get("/weather", requireAuth, toolsController.getWeather);
router.get("/weather/tiles/:layer/:z/:x/:y", requireAuth, toolsController.weatherProxy);

/**
 * @swagger
 * /proxy-image:
 *   get:
 *     tags: [AI Tools]
 *     summary: Fetch an allowlisted external image server-side (OAuth avatar CDNs) to work around canvas CORS taint
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Proxied image bytes
 */
router.get("/proxy-image", requireAuth, toolsController.proxyImage);

// TEMPORARY — remove alongside the debugOpenAI controller once diagnosed.
router.get("/debug-openai", requireAuth, toolsController.debugOpenAI);

/**
 * @swagger
 * /translate:
 *   post:
 *     tags: [AI Tools]
 *     summary: Translate text between languages
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text, to]
 *             properties:
 *               text: { type: string }
 *               from: { type: string, default: auto }
 *               to: { type: string, example: hi }
 *     responses:
 *       200:
 *         description: Translation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 translatedText: { type: string }
 *                 pronunciation: { type: string }
 */
router.post("/translate", requireAuth, aiLimiter, toolsController.translateText);

/**
 * @swagger
 * /emergency:
 *   get:
 *     tags: [AI Tools]
 *     summary: Nearby emergency services (deprecated — use /emergency/:query)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Emergency data
 */
router.get("/emergency", requireAuth, toolsController.getEmergencyContacts);

/**
 * @swagger
 * /planTrip:
 *   post:
 *     tags: [AI Tools]
 *     summary: AI trip planner — generate full itinerary
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               destination: { type: string }
 *               days: { type: integer }
 *               budget: { type: number }
 *               travelers: { type: integer }
 *               style: { type: string }
 *     responses:
 *       200:
 *         description: Generated trip plan
 */
router.post("/planTrip", requireAuth, generationLimiter, toolsController.planTrip);
router.get("/proactive-insights", requireAuth, aiLimiter, toolsController.getProactiveInsights);

export default router;
