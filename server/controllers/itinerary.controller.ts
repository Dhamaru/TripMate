import { Request, Response, NextFunction } from "express";
import { TripModel } from "@shared/schema";
import { NotFoundError } from "../errors";
import { nanoid } from "nanoid";
import { socketService } from "../services/SocketService";

export const addActivity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dayIndex, activity } = req.body;
        const tripId = req.params.id;
        const userId = req.user!._id;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { collaborators: { $elemMatch: { userId, role: "editor" } } }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const newActivity = { ...activity, id: nanoid() };

        if (!trip.itinerary) trip.itinerary = [];
        if (!trip.itinerary[dayIndex]) {
            trip.itinerary[dayIndex] = { dayIndex, activities: [] };
        }

        trip.itinerary[dayIndex].activities.push(newActivity);
        trip.markModified("itinerary");
        await trip.save();

        socketService.broadcastMutation(tripId, { type: "itinerary-updated", data: trip.itinerary });

        res.status(201).json(trip);
    } catch (error) {
        next(error);
    }
};

export const updateActivity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dayIndex, data } = req.body;
        const { id: tripId, activityId } = req.params;
        const userId = req.user!._id;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { collaborators: { $elemMatch: { userId, role: "editor" } } }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const day = trip.itinerary?.find(d => d.dayIndex === dayIndex);
        if (!day) throw new NotFoundError("Day not found");

        const activity = day.activities.find((a: any) => a.id === activityId);
        if (!activity) throw new NotFoundError("Activity not found");

        Object.assign(activity, data);
        trip.markModified("itinerary");
        await trip.save();

        socketService.broadcastMutation(tripId, { type: "itinerary-updated", data: trip.itinerary });

        res.json(trip);
    } catch (error) {
        next(error);
    }
};

export const deleteActivity = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dayIndex } = req.body;
        const { id: tripId, activityId } = req.params;
        const userId = req.user!._id;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { collaborators: { $elemMatch: { userId, role: "editor" } } }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const day = trip.itinerary?.find(d => d.dayIndex === dayIndex);
        if (day) {
            day.activities = day.activities.filter((a: any) => a.id !== activityId);
            trip.markModified("itinerary");
            await trip.save();
            socketService.broadcastMutation(tripId, { type: "itinerary-updated", data: trip.itinerary });
        }

        res.json(trip);
    } catch (error) {
        next(error);
    }
};

export const reorderItinerary = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { itinerary } = req.body;
        const tripId = req.params.id;
        const userId = req.user!._id;

        const trip = await TripModel.findOneAndUpdate(
            {
                _id: tripId,
                $or: [
                    { userId },
                    { collaborators: { $elemMatch: { userId, role: "editor" } } }
                ]
            },
            { itinerary },
            { new: true }
        );
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        socketService.broadcastMutation(tripId, { type: "itinerary-updated", data: trip.itinerary });

        res.json(trip);
    } catch (error) {
        next(error);
    }
};

export const toggleVote = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { dayIndex, activityId, vote } = req.body; // vote: 1 (up), -1 (down), 0 (clear)
        const tripId = req.params.id;
        const userId = req.user!._id;

        const trip = await TripModel.findOne({
            _id: tripId,
            $or: [
                { userId },
                { collaborators: { $elemMatch: { userId } } }
            ]
        });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const day = trip.itinerary?.find(d => d.dayIndex === dayIndex);
        if (!day) throw new NotFoundError("Day not found");

        const activity = day.activities.find((a: any) => a.id === activityId);
        if (!activity) throw new NotFoundError("Activity not found");

        // Aggregated voting for MVP
        // In production, we'd store per-user votes in a separate collection
        activity.votes = (activity.votes || 0) + (vote || 0);
        
        // Add a "vibe signal" if vote is negative
        if (vote < 0) {
            activity.vibeSignals = [...(activity.vibeSignals || []), "Low Vibe"];
        } else if (vote > 0) {
            activity.vibeSignals = [...(activity.vibeSignals || []), "High Vibe"];
        }

        trip.markModified("itinerary");
        await trip.save();

        socketService.broadcastMutation(tripId, { type: "itinerary-updated", data: trip.itinerary });
        res.json(trip);
    } catch (error) {
        next(error);
    }
};
