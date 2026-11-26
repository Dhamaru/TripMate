import { NotificationModel, UserModel } from "@shared/schema";
import { socketService } from "./services/SocketService";

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  tripId?: string;
  actorName?: string;
  /** When set, a burst of the same key within GROUP_WINDOW_MS collapses
   *  into a single row (count bumped) instead of N rows / N toasts. */
  groupKey?: string;
}

const NOTIF_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const GROUP_WINDOW_MS = 30 * 60 * 1000; // 30 min

/** Writes the notification to the DB (source of truth, survives reloads/
 * other devices) and pushes it live over the socket. Skips both if the
 * recipient muted this type — enforced here, the single choke point.
 * If `groupKey` is set and a recent unread row with the same key exists,
 * that row is bumped instead of creating a new one. Returns null when
 * muted, the doc otherwise. */
export async function notifyUser(input: CreateNotificationInput) {
  const recipient = await UserModel.findById(input.userId).select("mutedNotificationTypes").lean();
  if (recipient?.mutedNotificationTypes?.includes(input.type)) {
    return null;
  }

  const expiresAt = new Date(Date.now() + NOTIF_TTL_MS);

  if (input.groupKey) {
    const since = new Date(Date.now() - GROUP_WINDOW_MS);
    const existing = await NotificationModel.findOneAndUpdate(
      {
        userId: input.userId,
        groupKey: input.groupKey,
        read: false,
        createdAt: { $gt: since },
      },
      {
        $inc: { count: 1 },
        $set: {
          title: input.title,
          message: input.message,
          link: input.link,
          actorName: input.actorName,
          expiresAt,
        },
      },
      { new: true, sort: { createdAt: -1 } },
    );
    if (existing) {
      socketService.pushNotification(input.userId, {
        id: existing.id,
        type: existing.type,
        title: existing.title,
        message: existing.message,
        link: existing.link,
        count: existing.count,
        grouped: true,
        createdAt: existing.createdAt.toISOString(),
      });
      return existing;
    }
  }

  const doc = await NotificationModel.create({ ...input, expiresAt });
  socketService.pushNotification(input.userId, {
    id: doc.id,
    type: doc.type,
    title: doc.title,
    message: doc.message,
    link: doc.link,
    count: doc.count,
    createdAt: doc.createdAt.toISOString(),
  });
  return doc;
}

interface TripParticipants {
  userId: string; // owner
  collaborators?: { userId: string }[];
}

/** Notifies every participant on a trip (owner + collaborators) except the
 * person who caused the event. */
export async function notifyTripParticipants(
  trip: TripParticipants,
  actorUserId: string,
  notif: Omit<CreateNotificationInput, "userId">,
) {
  const participantIds = new Set<string>([
    String(trip.userId),
    ...(trip.collaborators ?? []).map((c) => String(c.userId)),
  ]);
  participantIds.delete(String(actorUserId));

  await Promise.all(Array.from(participantIds).map((userId) => notifyUser({ ...notif, userId })));
}
