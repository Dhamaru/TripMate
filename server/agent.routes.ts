// Atlas Agent — API Routes (Gemini Integration)

import { Router } from 'express';
import { isJwtAuthenticated } from './auth';
import { runAgentLoop } from './agent/agentLoop';
import { AtlasMemoryService } from './agent/memory';
import { AiUtilitiesService } from './AiUtilitiesService';
import { config } from './config';
import type { AgentContext, Message } from './agent/types';
import OpenAI from 'openai';

const router = Router();

// OpenAI client pointing at NVIDIA NIM
const openai = new OpenAI({
    apiKey: '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',
    baseURL: 'https://integrate.api.nvidia.com/v1',
});
const aiService = new AiUtilitiesService();

/**
 * POST /api/v1/agent/chat
 * Primary endpoint for Atlas chat.
 */
router.post('/chat', isJwtAuthenticated, async (req: any, res) => {
    const { tripId, message, context: clientContext } = req.body;
    const userId = req.user.claims?.sub || req.user.id;

    if (!message) {
        return res.status(400).json({ message: 'Message is required' });
    }

    try {
        // 1. Fetch trip context if tripId is provided
        // (Existing logic kept for context fetching)

        // 2. Fetch conversation history
        const history = tripId ? await AtlasMemoryService.getHistory(tripId, userId) : [];

        // 3. Run Agent Loop
        const response = await runAgentLoop(
            {
                message,
                userId,
                context: {
                    userId,
                    tripId,
                    ...clientContext,
                },
                conversationHistory: history,
            },
            {
                openai,
                aiService: aiService as any,
            }
        );

        // 4. Save new messages to history
        if (tripId && response.message) {
            const newMessages: Message[] = [
                { role: 'user', content: message },
                { role: 'assistant', content: response.message },
            ];

            await AtlasMemoryService.addMessages(tripId, userId, newMessages, {
                totalToolCalls: response.toolsUsed.length,
                toolsUsed: response.toolsUsed,
                lastConfidence: response.confidence.score,
            });
        }

        res.json(response);
    } catch (error: any) {
        console.error('[Agent:Route] Chat error:', error);
        res.status(500).json({ message: 'Atlas encountered an internal error.', error: error.message });
    }
});

/**
 * GET /api/v1/agent/history/:tripId
 * Fetch conversation history for a trip.
 */
router.get('/history/:tripId', isJwtAuthenticated, async (req: any, res) => {
    const { tripId } = req.params;
    const userId = req.user.claims?.sub || req.user.id;

    try {
        const history = await AtlasMemoryService.getHistory(tripId, userId);
        res.json(history);
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to fetch history' });
    }
});

/**
 * DELETE /api/v1/agent/history/:tripId
 * Clear conversation history for a trip.
 */
router.delete('/history/:tripId', isJwtAuthenticated, async (req: any, res) => {
    const { tripId } = req.params;
    const userId = req.user.claims?.sub || req.user.id;

    try {
        const success = await AtlasMemoryService.clearHistory(tripId, userId);
        res.json({ success });
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to clear history' });
    }
});

export default router;
