import { NotificationModel } from "@shared/schema";
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
 * user's connections are online right now. */
export async function notifyUser(input: CreateNotificationInput) {
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
