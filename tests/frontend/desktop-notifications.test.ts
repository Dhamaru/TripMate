import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isDesktopApp,
  isPushSupported,
  setDesktopNotifications,
  showDesktopNotification,
} from "@/lib/push";

// The Windows app (WebView2) has no web-push service, so it uses native
// notifications for live events instead of a push subscription.
describe("desktop app notifications", () => {
  let shown: { title: string; body?: string }[];
  beforeEach(() => {
    shown = [];
    (window as any).chrome = { webview: {} };
    class FakeNotification {
      static permission = "granted";
      static requestPermission = vi.fn(async () => "granted");
      onclick: (() => void) | null = null;
      constructor(title: string, opts?: { body?: string }) {
        shown.push({ title, body: opts?.body });
      }
      close() {}
    }
    vi.stubGlobal("Notification", FakeNotification);
    localStorage.clear();
  });
  afterEach(() => {
    delete (window as any).chrome;
    vi.unstubAllGlobals();
  });

  it("detects the Windows app and doesn't offer web push there", () => {
    expect(isDesktopApp()).toBe(true);
    expect(isPushSupported()).toBe(false);
  });

  it("shows a Windows notification only when enabled and the window is in the background", async () => {
    const n = { id: "1", title: "Trip updated", message: "Day 2 changed" };
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    showDesktopNotification(n, () => {});
    expect(shown).toHaveLength(0);

    expect(await setDesktopNotifications(true)).toBe("ok");
    showDesktopNotification(n, () => {});
    expect(shown).toEqual([{ title: "Trip updated", body: "Day 2 changed" }]);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    showDesktopNotification(n, () => {});
    expect(shown).toHaveLength(1);
  });

  it("reports when Windows blocks notifications", async () => {
    (Notification as any).requestPermission = vi.fn(async () => "denied");
    expect(await setDesktopNotifications(true)).toBe("denied");
  });
});
