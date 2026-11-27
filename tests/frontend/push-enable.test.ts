import { describe, it, expect, vi, afterEach } from "vitest";
import { enablePushNotifications } from "@/lib/push";

function setup(subscribeError: DOMException) {
  vi.stubGlobal("Notification", {
    permission: "granted",
    requestPermission: async () => "granted",
  });
  vi.stubGlobal("PushManager", function () {});
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ publicKey: "BEl62iUYgUivxIkv69yViEuiBIa" }), { status: 200 }),
    ),
  );
  const reg = {
    pushManager: {
      getSubscription: async () => null,
      subscribe: async () => {
        throw subscribeError;
      },
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve(reg) },
    configurable: true,
  });
}

describe("enablePushNotifications", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports a private window when Chrome refuses push despite granted permission", async () => {
    setup(new DOMException("Registration failed - permission denied", "AbortError"));
    expect(await enablePushNotifications()).toMatchObject({ ok: false, reason: "private-window" });
  });

  it("reports the push service for other push failures", async () => {
    setup(new DOMException("Registration failed - push service error", "AbortError"));
    expect(await enablePushNotifications()).toMatchObject({ ok: false, reason: "push-service" });
  });

  it("does not prompt again when permission is already denied", async () => {
    setup(new DOMException("unused", "AbortError"));
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "denied", requestPermission });
    expect(await enablePushNotifications()).toMatchObject({ ok: false, reason: "denied" });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reports a dismissed prompt instead of leaving the toggle spinning", async () => {
    setup(new DOMException("unused", "AbortError"));
    vi.stubGlobal("Notification", {
      permission: "default",
      // Embedded browsers can auto-dismiss the prompt without settling this.
      requestPermission: () => new Promise<NotificationPermission>(() => {}),
    });
    vi.useFakeTimers();
    try {
      const result = enablePushNotifications();
      await vi.advanceTimersByTimeAsync(10000);
      expect(await result).toMatchObject({ ok: false, reason: "prompt-dismissed" });
    } finally {
      vi.useRealTimers();
    }
  });
});
