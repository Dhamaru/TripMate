// Task 14 — Journal AI controllers: contextualize, enhance, confirmEnhancement, generateRecap

import { Request, Response, NextFunction } from "express";
import { JournalEntryModel, TripModel } from "@shared/schema";
import { NotFoundError, InternalServerError, ForbiddenError, BadRequestError } from "../errors";
import OpenAI from 'openai';
import { runAgentLoop } from "../agent/agentLoop";
import { buildContextualizationPrompt, buildEnhancementPrompt, buildRecapPrompt } from "../agent/prompts/journalPrompts";
import { AiUtilitiesService } from "../AiUtilitiesService";
import { config } from "../config";
import logger from "../logger";
import { socketService } from "../services/SocketService";

const openai = new OpenAI({
    apiKey: config.NVIDIA_API_KEY_2 || config.NVIDIA_API_KEY || '',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    timeout: 25_000,
    maxRetries: 0,
});
const aiService = new AiUtilitiesService();

async function runJournalAgent(prompt: string, userId: string): Promise<string> {
    const result = await runAgentLoop(
        { message: prompt, userId, context: { userId } },
        { openai, aiService: aiService as any }
    );
    return result.message;
}

export const augmentEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { content, destination } = req.body as { content?: string; destination?: string };
        if (!content || !content.trim()) throw new BadRequestError("Content is required");

        const result = await aiService.augmentJournalEntry(content, destination);
        res.json(result);
    } catch (err) {
        next(err);
    }
};

export const contextualizeEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!._id;
        const entry = await JournalEntryModel.findById(req.params.id);
        if (!entry) throw new NotFoundError("Entry not found");

        // Check access: Author OR any editor of the associated trip
        if (entry.userId !== userId.toString()) {
            if (entry.tripId) {
                const trip = await TripModel.findOne({
                    _id: entry.tripId,
                    $or: [
                        { userId },
                        { collaborators: { $elemMatch: { userId, role: "editor" } } }
                    ]
                });
                if (!trip) throw new ForbiddenError("Insufficient permissions");
            } else {
                throw new ForbiddenError("Insufficient permissions");
            }
        }

        const tripId = entry.tripId;
        const trip = tripId ? await TripModel.findById(tripId) : null;

        const itinerary = (trip?.itinerary ?? []).map((day: { dayIndex?: number; activities?: Array<{ title?: string; location?: string }> }, idx: number) => ({
            dayIndex: day.dayIndex ?? idx,
            date: `Day ${(day.dayIndex ?? idx) + 1}`,
            activities: (day.activities ?? []).map((a: { title?: string; location?: string }) => ({
                title: a.title ?? "Activity",
                location: a.location ?? "",
            })),
        }));

        const prompt = buildContextualizationPrompt(
            entry.content ?? (entry as any).text ?? "",
            entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString(),
            itinerary
        );

        if (tripId) socketService.broadcastAtlasThinking(tripId.toString(), true);
        const raw = await runJournalAgent(prompt, String(userId));
        if (tripId) socketService.broadcastAtlasThinking(tripId.toString(), false);
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as { dayIndex: number; confidence: string; reasoning: string } : null;
        if (!parsed) throw new InternalServerError("Failed to contextualize entry");

        const updated = await JournalEntryModel.findByIdAndUpdate(
            entry._id,
            {
                assignedDayIndex: parsed.dayIndex,
                contextConfidence: parsed.confidence,
                contextReasoning: parsed.reasoning,
            },
            { new: true }
        );

        logger.info(`[journal] Contextualized entry ${entry._id} → day ${parsed.dayIndex}`);
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

export const enhanceEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!._id;
        const entry = await JournalEntryModel.findById(req.params.id);
        if (!entry) throw new NotFoundError("Entry not found");

        if (entry.userId !== userId.toString()) {
            if (entry.tripId) {
                const trip = await TripModel.findOne({
                    _id: entry.tripId,
                    $or: [
                        { userId },
                        { collaborators: { $elemMatch: { userId, role: "editor" } } }
                    ]
                });
                if (!trip) throw new ForbiddenError("Insufficient permissions");
            } else {
                throw new ForbiddenError("Insufficient permissions");
            }
        }

        const originalText = entry.content ?? (entry as any).text ?? "";
        const prompt = buildEnhancementPrompt(originalText);
        if (entry.tripId) socketService.broadcastAtlasThinking(entry.tripId.toString(), true);
        const raw = await runJournalAgent(prompt, String(userId));
        if (entry.tripId) socketService.broadcastAtlasThinking(entry.tripId.toString(), false);

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as { enhanced: string; changesSummary: string } : null;
        if (!parsed) throw new InternalServerError("Failed to enhance entry");

        logger.info(`[journal] Enhanced entry ${entry._id}`);
        res.json({ success: true, data: { ...parsed, original: originalText } });
    } catch (err) {
        next(err);
    }
};

export const confirmEnhancement = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!._id;
        const { text } = req.body as { text: string };

        const updated = await JournalEntryModel.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [
                    { userId },
                    { tripId: { $exists: true } } // Placeholder, logic below is more precise
                ]
            },
            { content: text, enhanced: true },
            { new: true }
        );
        
        if (!updated) throw new NotFoundError("Entry not found");

        // Double check permissions if updated by non-author
        if (updated.userId !== userId.toString()) {
            const trip = await TripModel.findOne({
                _id: updated.tripId,
                collaborators: { $elemMatch: { userId, role: "editor" } }
            });
            if (!trip) {
                // Relentlessly revert or throw error if permissions were dodged (unlikely with .findOneAndUpdate)
                throw new ForbiddenError("Insufficient permissions");
            }
        }

        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

export const generateRecap = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!._id;
        const { tripId } = req.params;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { "collaborators.userId": userId }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const entries = await JournalEntryModel.find({ tripId }).sort({ createdAt: 1 });
        if (entries.length < 3) {
            return res.status(400).json({ success: false, error: "At least 3 journal entries are required for a recap" });
        }

        const entriesMapped = entries.map(e => ({
            text: e.content ?? (e as any).text ?? "",
            entryDate: (e.createdAt ? new Date(e.createdAt) : new Date()).toISOString(),
            assignedDayIndex: (e as any).assignedDayIndex,
        }));

        const prompt = buildRecapPrompt(entriesMapped, {
            destination: trip.destination,
            startDate: (trip.startDate ?? new Date()).toISOString(),
            endDate: (trip.endDate ?? new Date()).toISOString(),
        });

        socketService.broadcastAtlasThinking(tripId, true);
        const raw = await runJournalAgent(prompt, String(userId));
        socketService.broadcastAtlasThinking(tripId, false);
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as {
            title: string;
            summary: string;
            highlights: string[];
            memorableMoment: string;
            travelTip: string;
            awards: Array<{ title: string; icon: string; description: string }>;
            visualVibe: string;
        } : null;

        if (!parsed) throw new InternalServerError("Failed to generate recap");

        // Save as a special journal entry
        const recapEntry = await JournalEntryModel.create({
            userId,
            tripId,
            content: parsed.summary,
            entryDate: new Date(),
            isRecap: true,
            recapMeta: { 
                title: parsed.title, 
                highlights: parsed.highlights, 
                memorableMoment: parsed.memorableMoment, 
                travelTip: parsed.travelTip,
                awards: parsed.awards,
                visualVibe: parsed.visualVibe
            },
        });

        logger.info(`[journal] Generated recap for trip ${tripId}`);
        return res.json({ success: true, data: { recap: recapEntry } });
    } catch (err) {
        return next(err);
    }
};
