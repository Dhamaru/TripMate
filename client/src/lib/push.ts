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

export async function enablePushNotifications(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!isPushSupported()) return { ok: false, reason: "not-supported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const keyRes = await apiRequest("GET", "/api/v1/push/vapid-public-key");
  const { publicKey } = await keyRes.json();
  if (!publicKey) return { ok: false, reason: "not-configured" };

  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await apiRequest("POST", "/api/v1/push/subscribe", { subscription: subscription.toJSON() });
  return { ok: true };
}

export async function disablePushNotifications(): Promise<void> {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await apiRequest("POST", "/api/v1/push/unsubscribe", { endpoint });
}
