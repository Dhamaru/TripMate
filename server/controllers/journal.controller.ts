import { Request, Response, NextFunction } from "express";
import { JournalEntryModel, TripModel } from "@shared/schema";
import { NotFoundError, ForbiddenError } from "../errors";
import { socketService } from "../services/SocketService";

function fileUrls(req: Request): string[] {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || !files.length) return [];
    return files.map(f => `/uploads/journal/${f.filename}`);
}

export const createEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const entryData = req.body;
        const uploadedPhotos = fileUrls(req);

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
            photos: uploadedPhotos,
        });

        if (entry.tripId) {
            socketService.broadcastMutation(entry.tripId.toString(), { type: "journal-updated", data: entry }, String(userId));
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

        let entriesQuery = JournalEntryModel.find(query).sort({ createdAt: -1 });
        if (req.query.light === "true") {
            entriesQuery = entriesQuery.select("title location photos createdAt updatedAt userId tripId isRecap dayIndex");
        }
        const entries = await entriesQuery;
        res.json(entries);
    } catch (error) {
        next(error);
    }
};

export const getEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const entry = await JournalEntryModel.findById(req.params.id);
        if (!entry) throw new NotFoundError("Entry not found");

        if (entry.userId !== userId.toString()) {
            if (entry.tripId) {
                const trip = await TripModel.findOne({
                    _id: entry.tripId,
                    $or: [
                        { userId },
                        { "collaborators.userId": userId }
                    ]
                });
                if (!trip) throw new ForbiddenError("Insufficient permissions");
            } else {
                throw new ForbiddenError("Insufficient permissions");
            }
        }

        res.json(entry);
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

        const uploadedPhotos = fileUrls(req);
        let keptPhotos: string[] = [];
        try { keptPhotos = JSON.parse(req.body.existingPhotos || "[]"); } catch { }
        const allPhotos = [...keptPhotos, ...uploadedPhotos];

        // Allowlist only — spreading req.body directly let a client pass
        // userId/tripId in the multipart form and reassign ownership of an
        // entry they only have edit access to. Photos always set (not just
        // when non-empty) so removing every photo actually clears the field
        // instead of silently leaving the old array in place.
        const update: Record<string, unknown> = { photos: allPhotos };
        if (req.body.title !== undefined) update.title = req.body.title;
        if (req.body.content !== undefined) update.content = req.body.content;
        if (req.body.location !== undefined) update.location = req.body.location;
        if (req.body.latitude !== undefined) update.latitude = req.body.latitude;
        if (req.body.longitude !== undefined) update.longitude = req.body.longitude;
        if (req.body.dayIndex !== undefined) update.dayIndex = req.body.dayIndex;

        const updatedEntry = await JournalEntryModel.findByIdAndUpdate(
            entryId,
            update,
            { new: true, runValidators: true }
        );

        if (updatedEntry?.tripId) {
            socketService.broadcastMutation(updatedEntry.tripId.toString(), { type: "journal-updated", data: updatedEntry }, String(userId));
        }

        res.json(updatedEntry);
    } catch (error) {
        next(error);
    }
};

export const deleteEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const entryId = req.params.id;

        const entry = await JournalEntryModel.findById(entryId);
        if (!entry) throw new NotFoundError("Entry not found");

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
            socketService.broadcastMutation(entry.tripId.toString(), { type: "journal-deleted", data: { id: entryId } }, String(userId));
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};
