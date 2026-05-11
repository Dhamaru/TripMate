import { Request, Response, NextFunction } from "express";
import { runAgentLoop } from "../agent/agentLoop";
import { AtlasMemoryService } from "../agent/memory";
import { AiUtilitiesService } from "../AiUtilitiesService";
import { UnauthorizedError } from "../errors";
import { config } from "../config";
import OpenAI from "openai";

// OpenAI configuration is now handled natively within `agentLoop.ts`
const emptyOpenai = null;
const aiService = new AiUtilitiesService();

export const chat = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId, message, context: clientContext } = req.body;
        const userId = req.user?._id || req.user?.id;
        if (!userId) throw new UnauthorizedError();

        if (!message) {
            return res.status(400).json({ message: "Message is required" });
        }

        const actualTripId = tripId || clientContext?.currentTripId || clientContext?.tripId;

        // 1. Fetch conversation history
        const history = actualTripId ? await AtlasMemoryService.getHistory(actualTripId, userId) : [];

        // 2. Run Agent Loop
        const result = await runAgentLoop(
            {
                message,
                userId,
                context: {
                    userId,
                    tripId: actualTripId,
                    ...clientContext,
                },
                conversationHistory: history,
            },
            {
                openai: emptyOpenai,
                aiService: aiService as any,
            }
        );

        // 3. Save new messages to history
        if (actualTripId && result.message) {
            await AtlasMemoryService.addMessages(actualTripId, userId, [
                { role: "user", content: message },
                { role: "assistant", content: result.message },
            ], {
                totalToolCalls: result.toolsUsed.length,
                toolsUsed: result.toolsUsed,
                lastConfidence: result.confidence.score,
            });
        }

        res.json(result);
    } catch (error) {
        next(error);
    }
};

export const stream = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId, message, context: clientContext } = req.query;
        const userId = req.user?._id || req.user?.id;
        if (!userId) throw new UnauthorizedError();

        if (!message) {
            return res.status(400).json({ message: "Message is required" });
        }

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const tripIdStr = (tripId || req.query.currentTripId) as string;
        const messageStr = message as string;
        const currentPage = req.query.currentPage as string;
        
        let contextObj: any = {};
        if (clientContext) {
            try {
                contextObj = JSON.parse(clientContext as string);
            } catch (e) {
                console.warn('[Agent:Controller] Failed to parse clientContext', e);
            }
        }
        
        if (currentPage && !contextObj.currentPage) contextObj.currentPage = currentPage;
        if (tripIdStr && !contextObj.currentTripId) contextObj.currentTripId = tripIdStr;

        // 1. Fetch conversation history
        const history = tripIdStr ? await AtlasMemoryService.getHistory(tripIdStr, userId) : [];

        // 2. Run Agent Loop with callbacks
        const result = await runAgentLoop(
            {
                message: messageStr,
                userId,
                context: {
                    userId,
                    tripId: tripIdStr,
                    ...contextObj,
                },
                conversationHistory: history,
                onToken: (token) => {
                    res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
                },
                onTool: (toolName) => {
                    res.write(`data: ${JSON.stringify({ type: 'tool', tool: toolName })}\n\n`);
                }
            },
            {
                openai: emptyOpenai,
                aiService: aiService as any,
            }
        );

        // 3. Save new messages to history
        if (tripIdStr && result.message) {
            await AtlasMemoryService.addMessages(tripIdStr, userId, [
                { role: "user", content: messageStr },
                { role: "assistant", content: result.message },
            ], {
                totalToolCalls: result.toolsUsed.length,
                toolsUsed: result.toolsUsed,
                lastConfidence: result.confidence.score,
            });
        }

        // 4. Send final combined event
        res.write(`data: ${JSON.stringify({ 
            type: 'done', 
            toolsUsed: result.toolsUsed,
            confidence: result.confidence,
            feasibilityScore: result.feasibilityScore,
            mutations: result.mutations,
            structuredData: result.structuredData
        })}\n\n`);
        
        res.end();
    } catch (error) {
        console.error('[Agent:Controller] Stream error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal stream error' })}\n\n`);
        res.end();
    }
};

export const getHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId } = req.params;
        const userId = req.user!._id;
        const history = await AtlasMemoryService.getHistory(tripId, userId);
        res.json(history);
    } catch (error) {
        next(error);
    }
};

export const clearHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tripId } = req.params;
        const userId = req.user!._id;
        const success = await AtlasMemoryService.clearHistory(tripId, userId);
        res.json({ success });
    } catch (error) {
        next(error);
    }
};
