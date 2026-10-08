import { Router } from "express";
import * as toolsController from "../controllers/tools.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { aiLimiter } from "../middleware/rateLimit.middleware";

const router = Router();

/**
 * @swagger
 * /emergency/{query}:
 *   get:
 *     tags: [AI Tools]
 *     summary: Nearby emergency services + location-aware SOS numbers
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: query
 *         required: false
 *         schema: { type: string }
 *         description: City name or "lat,lon" coordinates
 *     responses:
 *       200:
 *         description: Emergency services list + country SOS numbers
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmergencyResponse'
 */
// aiLimiter: each request can fire up to ~14 billed external API calls
// (Nominatim geocode + up to 12 Google Places Nearby Search calls across
// hospital/police/embassy/pharmacy on the AI-fallback path, plus a
// separate Nominatim call for SOS-number country detection) -- without
// this, requireAuth alone caps nothing, and a logged-in caller cycling
// location strings could burn through the Places quota at over a
// thousand calls/minute.
router.get("/", requireAuth, aiLimiter, toolsController.getEmergencyContacts);
router.get("/:query?", requireAuth, aiLimiter, toolsController.getEmergencyContacts);

export default router;
