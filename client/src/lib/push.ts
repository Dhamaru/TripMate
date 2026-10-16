// Web push opt-in — wired into Profile.tsx. Real OS-level notifications
// (lock screen, notification center) as opposed to NotificationBell.tsx's
// in-app list, which only updates while a TripMate tab is actually open.
import { apiRequest } from "./queryClient";

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// applicationServerKey wants a Uint8Array, the VAPID public key travels as
// a URL-safe base64 string — standard conversion, same snippet every
// web-push integration guide uses.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export type PushEnableResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not-supported"
        | "denied"
        | "not-configured"
        | "no-service-worker"
        | "push-service"
        | "private-window"
        | "server";
      detail?: string;
    };

// Subscribing used to throw straight into Profile's generic "Couldn't update
// push notification settings" toast, hiding which step failed. Each failure
// now comes back as a reason the toast can explain.
export async function enablePushNotifications(): Promise<PushEnableResult> {
  if (!isPushSupported()) return { ok: false, reason: "not-supported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const keyRes = await apiRequest("GET", "/api/v1/push/vapid-public-key");
  const { publicKey } = keyRes.ok ? await keyRes.json() : { publicKey: null };
  if (!publicKey) return { ok: false, reason: "not-configured" };

  // ready never settles when no service worker is registered (or it failed to
  // install), which left the toggle spinning forever.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
  ]);
  if (!reg) return { ok: false, reason: "no-service-worker" };

  const key = urlBase64ToUint8Array(publicKey);
  let subscription = await reg.pushManager.getSubscription();
  try {
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    }
  } catch (e) {
    const err = e as DOMException;
    // A subscription made with an older VAPID key blocks a new one
    // (InvalidStateError) — drop it and subscribe once more.
    if (err.name === "InvalidStateError") {
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      try {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      } catch (e2) {
        return {
          ok: false,
          reason: "push-service",
          detail: `${(e2 as Error).name}: ${(e2 as Error).message}`,
        };
      }
    } else {
      // AbortError "push service error / not available": the browser's push
      // service is unreachable or disabled (e.g. Brave by default, embedded
      // webviews, some corporate networks).
      // Chrome rejects push in incognito with "permission denied" even though
      // notification permission is granted, and deliberately offers no way
      // to detect incognito up front (crbug.com/41124656).
      const privateWindow =
        /permission denied/i.test(err.message) && Notification.permission === "granted";
      return {
        ok: false,
        reason: privateWindow ? "private-window" : "push-service",
        detail: `${err.name}: ${err.message}`,
      };
    }
  }

  const saveRes = await apiRequest("POST", "/api/v1/push/subscribe", {
    subscription: subscription!.toJSON(),
  });
  if (!saveRes.ok) return { ok: false, reason: "server", detail: `HTTP ${saveRes.status}` };
  return { ok: true };
}

export async function disablePushNotifications(): Promise<void> {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiRequest("POST", "/api/v1/push/unsubscribe", { endpoint });
}
