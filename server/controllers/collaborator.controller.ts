import { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { TripModel, UserModel } from "@shared/schema";
import { BadRequestError, NotFoundError, ForbiddenError } from "../errors";
import { socketService } from "../services/SocketService";
import { sendCollaboratorInviteEmail } from "../email";
import { notifyUser } from "../notifications";

export const addCollaborator = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const { id: tripId } = req.params;
    const { email, role } = req.body;

    // Guest accounts are free and anonymous; inviting real people needs an account.
    if ((req.user as any)?.isGuest) {
      throw new BadRequestError("Create a free account to invite people to your trip.");
    }

    // Only the primary owner can add collaborators
    const trip = await TripModel.findOne({ _id: tripId, userId });
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    const userToAdd = await UserModel.findOne({ email: email.toLowerCase() });
    if (!userToAdd) throw new NotFoundError("User with this email not found");

    const userToAddId = (userToAdd as any)._id.toString();

    if (userToAddId === userId?.toString()) {
      throw new BadRequestError("You are already the owner of this trip");
    }

    const isAlreadyCollaborator = trip.collaborators?.some((c) => c.userId === userToAddId);
    if (isAlreadyCollaborator) {
      throw new BadRequestError("User is already a collaborator");
    }

    // Conditional push: two simultaneous invites for the same person both
    // passed the check above and added them twice.
    const updatedTrip = await TripModel.findOneAndUpdate(
      { _id: tripId, "collaborators.userId": { $ne: userToAddId } },
      {
        $push: {
          collaborators: {
            userId: userToAddId,
            role: role || "editor",
            joinedAt: new Date(),
          },
        },
      },
      { new: true },
    );
    if (!updatedTrip) throw new BadRequestError("User is already a collaborator");

    socketService.broadcastMutation(
      tripId,
      { type: "collaborators-updated", data: updatedTrip },
      String(userId),
    );

    res.json(updatedTrip);

    // Fire-and-forget — the invited user otherwise has no way to find
    // out they were added except being live on a socket connection to
    // this exact trip at this exact moment, which basically never
    // happens. Same silent-feature-gap pattern as the feedback form.
    setImmediate(async () => {
      try {
        const inviter = await UserModel.findById(userId);
        const inviterName =
          (inviter &&
            (`${inviter.firstName || ""} ${inviter.lastName || ""}`.trim() || inviter.email)) ||
          "A TripMate user";
        const destination = trip.destination || "a trip";
        await sendCollaboratorInviteEmail(
          email.toLowerCase(),
          inviterName,
          destination,
          tripId,
          role || "editor",
        );
        await notifyUser({
          userId: userToAddId,
          type: "collaborator-invite",
          title: "Added to a trip",
          message: `${inviterName} added you as a${role === "viewer" ? " viewer" : "n editor"} on their trip to ${destination}.`,
          link: `/app/trips/${tripId}`,
          tripId,
        });
      } catch (e) {
        console.error("[Collaborator] Invite email/notification failed:", e);
      }
    });
  },
);

export const removeCollaborator = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const { id: tripId, collaboratorId } = req.params;

    // The owner can remove anyone; a collaborator can remove themselves (leave).
    const leaving = String(userId) === String(collaboratorId);
    const trip = await TripModel.findOne(
      leaving ? { _id: tripId, "collaborators.userId": String(userId) } : { _id: tripId, userId },
    );
    if (!trip) throw new NotFoundError("Trip not found or access denied");

    // Only someone actually on the trip can be removed (and notified).
    const updatedTrip = await TripModel.findOneAndUpdate(
      { _id: tripId, "collaborators.userId": String(collaboratorId) },
      { $pull: { collaborators: { userId: String(collaboratorId) } } },
      { new: true },
    );
    if (!updatedTrip) throw new NotFoundError("That person isn't on this trip");

    // Out of the room first, so the removed user doesn't get this last update.
    socketService.removeFromTrip(collaboratorId, tripId);
    socketService.broadcastMutation(
      tripId,
      { type: "collaborators-updated", data: updatedTrip },
      String(userId),
    );
    // Notify the removed person directly — they're no longer in
    // trip.collaborators after the $pull above, so notifyTripParticipants
    // (which reads the trip's current participant list) can't reach them.
    if (!leaving) {
      await notifyUser({
        userId: collaboratorId,
        type: "collaborator-removed",
        title: "Removed from a trip",
        message: `You were removed as a collaborator on the trip to ${trip.destination}.`,
      });
    }

    res.json(updatedTrip);
  },
);

export const getCollaborators = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id || req.user?.id;
    const { id: tripId } = req.params;

    // Primary owner OR collaborator can view the list
    const trip = await TripModel.findOne({
      $or: [
        { _id: tripId, userId },
        { _id: tripId, "collaborators.userId": userId },
      ],
    });

    if (!trip) throw new ForbiddenError("Trip not found or access denied");

    // We use a separate query for population if needed, but for now just return the list
    // or actually populate it for a better UI experience
    const tripWithPeeps = await TripModel.findById(tripId).populate({
      path: "collaborators.userId",
      select: "firstName lastName email profileImageUrl avatar",
    });

    res.json(tripWithPeeps?.collaborators || []);
  },
);
