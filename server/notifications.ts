import { NotificationModel, UserModel } from "@shared/schema";
import { socketService } from "./services/SocketService";

interface CreateNotificationInput {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    tripId?: string;
}

/** Writes the notification to the DB (source of truth, survives reloads/
 * other devices) and pushes it live over the socket to whichever of the
 * user's connections are online right now. Skips both the write and the
 * push if the recipient has muted this notification type — enforced here,
 * the single choke point every trigger site goes through, rather than in
 * each call site individually. Returns null when skipped. */
export async function notifyUser(input: CreateNotificationInput) {
    const recipient = await UserModel.findById(input.userId).select('mutedNotificationTypes').lean();
    if (recipient?.mutedNotificationTypes?.includes(input.type)) {
        return null;
    }

    const doc = await NotificationModel.create(input);
    socketService.pushNotification(input.userId, {
        id: doc.id,
        type: doc.type,
        title: doc.title,
        message: doc.message,
        link: doc.link,
        createdAt: doc.createdAt.toISOString(),
    });
    return doc;
}

interface TripParticipants {
    userId: string; // owner
    collaborators?: { userId: string }[];
}

/** Notifies every participant on a trip (owner + collaborators) except the
 * person who caused the event — mirrors the excludeUserId exclusion
 * SocketService.broadcastMutation already does for live trip-page pushes,
 * so people don't get told about their own actions. */
export async function notifyTripParticipants(
    trip: TripParticipants,
    actorUserId: string,
    notif: Omit<CreateNotificationInput, 'userId'>,
) {
    const participantIds = new Set<string>([
        String(trip.userId),
        ...(trip.collaborators ?? []).map((c) => String(c.userId)),
    ]);
    participantIds.delete(String(actorUserId));

    await Promise.all(
        Array.from(participantIds).map((userId) => notifyUser({ ...notif, userId })),
    );
}
