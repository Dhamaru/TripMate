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
  afterEach(() => vi.unstubAllGlobals());

  it("reports a private window when Chrome refuses push despite granted permission", async () => {
    setup(new DOMException("Registration failed - permission denied", "AbortError"));
    expect(await enablePushNotifications()).toMatchObject({ ok: false, reason: "private-window" });
  });

  it("reports the push service for other push failures", async () => {
    setup(new DOMException("Registration failed - push service error", "AbortError"));
    expect(await enablePushNotifications()).toMatchObject({ ok: false, reason: "push-service" });
  });
});
