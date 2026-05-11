import { Request, Response, NextFunction } from "express";
import { TripModel, UserModel } from "@shared/schema";
import { BadRequestError, NotFoundError, ForbiddenError } from "../errors";
import { socketService } from "../services/SocketService";

export const addCollaborator = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const { id: tripId } = req.params;
        const { email, role } = req.body;

        // Only the primary owner can add collaborators
        const trip = await TripModel.findOne({ _id: tripId, userId });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const userToAdd = await UserModel.findOne({ email: email.toLowerCase() });
        if (!userToAdd) throw new NotFoundError("User with this email not found");

        const userToAddId = (userToAdd as any)._id.toString();

        if (userToAddId === userId?.toString()) {
            throw new BadRequestError("You are already the owner of this trip");
        }

        const isAlreadyCollaborator = trip.collaborators?.some(c => c.userId === userToAddId);
        if (isAlreadyCollaborator) {
            throw new BadRequestError("User is already a collaborator");
        }

        const updatedTrip = await TripModel.findByIdAndUpdate(
            tripId,
            {
                $push: {
                    collaborators: {
                        userId: userToAddId,
                        role: role || "editor",
                        joinedAt: new Date()
                    }
                }
            },
            { new: true }
        );

        socketService.broadcastMutation(tripId, { type: "collaborators-updated", data: updatedTrip });

        res.json(updatedTrip);
    } catch (error) {
        next(error);
    }
};

export const removeCollaborator = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const { id: tripId, collaboratorId } = req.params;

        // Only the primary owner can remove collaborators
        const trip = await TripModel.findOne({ _id: tripId, userId });
        if (!trip) throw new NotFoundError("Trip not found or access denied");

        const updatedTrip = await TripModel.findByIdAndUpdate(
            tripId,
            {
                $pull: {
                    collaborators: { userId: collaboratorId }
                }
            },
            { new: true }
        );

        socketService.broadcastMutation(tripId, { type: "collaborators-updated", data: updatedTrip });

        res.json(updatedTrip);
    } catch (error) {
        next(error);
    }
};

export const getCollaborators = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?._id || req.user?.id;
        const { id: tripId } = req.params;

        // Primary owner OR collaborator can view the list
        const trip = await TripModel.findOne({
            $or: [
                { _id: tripId, userId },
                { _id: tripId, "collaborators.userId": userId }
            ]
        });

        if (!trip) throw new ForbiddenError("Trip not found or access denied");

        // We use a separate query for population if needed, but for now just return the list
        // or actually populate it for a better UI experience
        const tripWithPeeps = await TripModel.findById(tripId).populate({
            path: 'collaborators.userId',
            select: 'firstName lastName email profileImageUrl avatar'
        });

        res.json(tripWithPeeps?.collaborators || []);
    } catch (error) {
        next(error);
    }
};
