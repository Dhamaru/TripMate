import { Router } from "express";
import { chat, stream, getHistory, clearHistory } from "../controllers/agent.controller";
import { requireAuth } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate";
import { agentMessageSchema } from "../schemas/agent.schemas";

const router = Router();

/**
 * @swagger
 * /agent/chat:
 *   post:
 *     tags: [Agent]
 *     summary: Send message to Atlas AI agent (non-streaming)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AgentMessage'
 *     responses:
 *       200:
 *         description: Agent response with toolsUsed, confidence, structuredData
 */
router.post("/chat", requireAuth, aiLimiter, validate(agentMessageSchema), chat);

/**
 * @swagger
 * /agent/chat/stream:
 *   get:
 *     tags: [Agent]
 *     summary: Stream Atlas AI agent response via SSE
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: message
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: conversationId
 *         schema: { type: string }
 *       - in: query
 *         name: currentTripId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: SSE stream of token/tool/done/error events
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get("/chat/stream", requireAuth, aiLimiter, stream);

/**
 * @swagger
 * /agent/history/{tripId}:
 *   get:
 *     tags: [Agent]
 *     summary: Get conversation history for a trip
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of message objects
 *   delete:
 *     tags: [Agent]
 *     summary: Clear conversation history for a trip
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: '{ success: true }'
 */
router.get("/history/:tripId", requireAuth, getHistory);
router.delete("/history/:tripId", requireAuth, clearHistory);

export default router;
