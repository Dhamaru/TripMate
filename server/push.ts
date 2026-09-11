// Real OS-level push notifications (web-push / VAPID) — a notification
// reaches the user's device even when TripMate isn't open in a tab,
// unlike the in-app bell (NotificationBell.tsx) which only updates
// whatever's currently rendered. Registers itself against every
// Notification write via the hook in shared/schema.ts, so no controller
// or notification-creation call site needs to know push exists.
import webpush from "web-push";
import { config } from "./config";
import { PushSubscriptionModel, onNotificationCreated, type INotification } from "@shared/schema";

const enabled = Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);

if (enabled) {
  webpush.setVapidDetails(
    config.VAPID_SUBJECT || "mailto:support@tripmate.app",
    config.VAPID_PUBLIC_KEY!,
    config.VAPID_PRIVATE_KEY!,
  );
} else {
  console.warn(
    "[Push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications disabled, in-app notifications still work normally.",
  );
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  if (!enabled) return;
  const subs = await PushSubscriptionModel.find({ userId });
  if (subs.length === 0) return;

  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, json);
      } catch (err: any) {
        // 404/410 = the browser/OS unsubscribed this endpoint on its own
        // (uninstall, cleared data, expired) — stop trying it, not an error.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await PushSubscriptionModel.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          console.error("[Push] send failed:", err?.message || err);
        }
      }
    }),
  );
}

onNotificationCreated((doc: INotification) => {
  sendPushToUser(doc.userId, {
    title: doc.title,
    body: doc.message,
    url: doc.link,
  }).catch((err) => console.error("[Push] onNotificationCreated failed:", err));
});
