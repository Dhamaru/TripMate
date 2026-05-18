import { Router } from "express";
import * as toolsController from "../controllers/tools.controller";
import { requireAuth } from "../middleware/auth";

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
router.get("/", requireAuth, toolsController.getEmergencyContacts);
router.get("/:query?", requireAuth, toolsController.getEmergencyContacts);

export default router;
