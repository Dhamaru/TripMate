import { Request, Response, NextFunction } from "express";
import { JournalEntryModel, TripModel } from "@shared/schema";
import { NotFoundError, ForbiddenError } from "../errors";
import { socketService } from "../services/SocketService";

export const createEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const entryData = req.body;

        // If tripId is provided, verify access
        if (entryData.tripId) {
            const trip = await TripModel.findOne({
                _id: entryData.tripId,
                $or: [
                    { userId },
                    { collaborators: { $elemMatch: { userId, role: "editor" } } }
                ]
            });
            if (!trip) throw new ForbiddenError("Trip access denied");
        }

        const entry = await JournalEntryModel.create({
            ...entryData,
            userId,
        });

        if (entry.tripId) {
            socketService.broadcastMutation(entry.tripId.toString(), { type: "journal-updated", data: entry });
        }

        res.status(201).json(entry);
    } catch (error) {
        next(error);
    }
};

export const getEntries = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const tripId = req.query.tripId;

        let query: any;
        if (tripId) {
            // Check trip access
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
            query = { userId };
        }

        const entries = await JournalEntryModel.find(query).sort({ createdAt: -1 });
        res.json(entries);
    } catch (error) {
        next(error);
    }
};

export const updateEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const entryId = req.params.id;

        const entry = await JournalEntryModel.findById(entryId);
        if (!entry) throw new NotFoundError("Entry not found");

        // Only author can edit? Or trip owner? Or any editor of the trip?
        // Let's allow the author OR any editor of the associated trip.
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

        const updatedEntry = await JournalEntryModel.findByIdAndUpdate(
            entryId,
            req.body,
            { new: true }
        );

        if (updatedEntry?.tripId) {
            socketService.broadcastMutation(updatedEntry.tripId.toString(), { type: "journal-updated", data: updatedEntry });
        }

        res.json(updatedEntry);
    } catch (error) {
        next(error);
    }
};

export const deleteEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const entryId = req.params.id;

        const entry = await JournalEntryModel.findById(entryId);
        if (!entry) throw new NotFoundError("Entry not found");

        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        if (entry.userId !== userId.toString()) {
            if (entry.tripId) {
                const trip = await TripModel.findById(entry.tripId);
                if (trip?.userId !== userId.toString()) {
                    throw new ForbiddenError("Only the author or trip owner can delete this entry");
                }
            } else {
                throw new ForbiddenError("Insufficient permissions");
            }
        }

        await JournalEntryModel.deleteOne({ _id: entryId });

        if (entry.tripId) {
            socketService.broadcastMutation(entry.tripId.toString(), { type: "journal-deleted", data: { id: entryId } });
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};
