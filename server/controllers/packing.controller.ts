import { Request, Response, NextFunction } from "express";
import { PackingListModel, TripModel } from "@shared/schema";
import { NotFoundError, InternalServerError, ForbiddenError } from "../errors";
import logger from "../logger";
import { MasterOrchestrator } from "../agent/multiAgent/MasterOrchestrator";
import { OrchestratorInput } from "../agent/multiAgent/types";
import { socketService } from "../services/SocketService";

const orchestrator = new MasterOrchestrator();

export const generatePackingList = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id: tripId } = req.params;
        const userId = req.user?._id || req.user?.id;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { collaborators: { $elemMatch: { userId, role: "editor" } } }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const input: OrchestratorInput = {
            userId: String(userId),
            tripId: String(tripId),
            trigger: 'packing_request',
            context: {
                trip: {
                    id: String(tripId),
                    destination: trip.destination,
                    startDate: trip.startDate ? trip.startDate.toISOString() : new Date().toISOString(),
                    endDate: trip.endDate ? trip.endDate.toISOString() : new Date().toISOString(),
                    budget: trip.budget || 0,
                    currency: trip.currency || 'INR',
                    travelStyle: trip.travelStyle || 'standard',
                    travelMedium: trip.transportMode || 'flight',
                    companions: trip.groupSize || 1,
                },
                currentPage: "packing"
            }
        };

        socketService.broadcastAtlasThinking(tripId as string, true);
        const result = await orchestrator.run(input);
        socketService.broadcastAtlasThinking(tripId as string, false);
        const packingAgentResult = result.results.find(r => r.agent === 'PackingAgent');

        if (!packingAgentResult || !packingAgentResult.success || !packingAgentResult.data) {
            throw new InternalServerError("Failed to generate packing list via AI agent");
        }

        const packingData = packingAgentResult.data as any;

        const packingList = await PackingListModel.findOneAndUpdate(
            { tripId, userId: trip.userId }, // Keep it under the owner's userId or allow shared? 
            // For now, let's keep it linked to the trip and the original owner to avoid duplicates, 
            // but allow collaborators to see/edit it via tripId.
            {
                tripId,
                userId: trip.userId,
                categories: packingData.categories.map((cat: any) => ({
                    ...cat,
                    items: cat.items.map((item: any) => ({ 
                        ...item, 
                        packed: item.checked || false,
                        name: item.label
                    })),
                })),
                weatherNote: packingData.weatherNote,
                totalItems: packingData.totalItems,
            },
            { upsert: true, new: true }
        );

        logger.info(`[packing] Generated packing list via Orchestrator for trip ${tripId}`);
        socketService.broadcastMutation(tripId as string, { type: "packing-updated", data: packingList });
        res.json({ success: true, data: packingList });
    } catch (err) {
        next(err);
    }
};

export const createPackingList = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const packingList = await PackingListModel.create({
            ...req.body,
            userId,
        });
        res.status(201).json(packingList);
    } catch (error) {
        next(error);
    }
};

export const getPackingLists = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const tripId = req.query.tripId;
        
        let query: any;
        if (tripId) {
            // Check if user has access to this trip
            const trip = await TripModel.findOne({
                _id: tripId,
                $or: [
                    { userId },
                    { "collaborators.userId": userId }
                ]
            });
            if (!trip) throw new ForbiddenError("Trip access denied");
            query = { tripId };
        } else {
            query = { userId }; // Fallback to personal lists if no tripId
        }

        const lists = await PackingListModel.find(query).sort({ createdAt: -1 });
        res.json(lists);
    } catch (error) {
        next(error);
    }
};

export const updatePackingItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id: listId, itemId } = req.params;
        const { packed, quantity, name } = req.body;
        const userId = req.user?._id || req.user?.id;

        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const list = await PackingListModel.findById(listId);
        if (!list) throw new NotFoundError("Packing list not found");

        // Check permission: Owner of list OR Collaborator (editor) on the trip
        if (list.userId !== userId.toString()) {
            if (list.tripId) {
                const trip = await TripModel.findOne({
                    _id: list.tripId,
                    collaborators: { $elemMatch: { userId, role: "editor" } }
                });
                if (!trip) throw new ForbiddenError("Insufficient permissions");
            } else {
                throw new ForbiddenError("Insufficient permissions");
            }
        }

        const item = (list.items as any).id(itemId);
        if (!item) throw new NotFoundError("Item not found");

        if (packed !== undefined) item.packed = packed;
        if (quantity !== undefined) item.quantity = quantity;
        if (name !== undefined) item.name = name;

        await list.save();
        if (list.tripId) {
            socketService.broadcastMutation(list.tripId.toString(), { type: "packing-updated", data: list });
        }
        res.json(list);
    } catch (error) {
        next(error);
    }
};

export const deletePackingList = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const list = await PackingListModel.findById(req.params.id);
        if (!list) throw new NotFoundError("Packing list not found");

        // Only owner can delete? Or anyone with editor role?
        // Let's say only packing list owner or trip owner can delete.
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const trip = list.tripId ? await TripModel.findById(list.tripId) : null;
        
        if (list.userId !== userId.toString() && trip?.userId !== userId.toString()) {
            throw new ForbiddenError("Only the owner can delete this packing list");
        }

        await PackingListModel.deleteOne({ _id: req.params.id });
        if (list.tripId) {
            socketService.broadcastMutation(list.tripId.toString(), { type: "packing-deleted", data: { id: req.params.id } });
        }
        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

export const updatePackingList = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id || req.user?.id;
        
        const list = await PackingListModel.findOneAndUpdate(
            { _id: id, userId },
            req.body,
            { new: true }
        );
        
        if (!list) throw new NotFoundError("Packing list not found");
        
        if (list.tripId) {
            socketService.broadcastMutation(list.tripId.toString(), { type: "packing-updated", data: list });
        }
        
        res.json(list);
    } catch (error) {
        next(error);
    }
};

export const togglePackingItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id: listId, itemId } = req.params;
        const userId = req.user?._id || req.user?.id;

        const list = await PackingListModel.findOne({ _id: listId, userId });
        if (!list) throw new NotFoundError("Packing list not found");

        const item = (list.items as any).id(itemId);
        if (!item) throw new NotFoundError("Item not found");

        item.packed = !item.packed;
        await list.save();

        if (list.tripId) {
            socketService.broadcastMutation(list.tripId.toString(), { type: "packing-updated", data: list });
        }

        res.json(item);
    } catch (error) {
        next(error);
    }
};
