/** @vitest-environment node */
import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { isPushServiceUrl } from "../../server/controllers/push.controller";
import { escapeHtml } from "../../server/email";

describe("push subscribe endpoint allowlist", () => {
  it("accepts real browser push services", () => {
    for (const u of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/abc",
    ])
      expect(isPushServiceUrl(u), u).toBe(true);
  });

  it("rejects anything the server shouldn't POST to", () => {
    for (const u of [
      "http://fcm.googleapis.com/x",
      "http://127.0.0.1:9/probe",
      "https://169.254.169.254/latest",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilfcm.googleapis.com.example/x",
      "not a url",
      undefined,
    ])
      expect(isPushServiceUrl(u), String(u)).toBe(false);
  });
});

describe("email escaping", () => {
  it("neutralises markup in user-supplied text", () => {
    expect(escapeHtml(`<a href="https://evil.example">Reset</a>`)).toBe(
      "&lt;a href=&quot;https://evil.example&quot;&gt;Reset&lt;/a&gt;",
    );
    expect(escapeHtml("Tom & Jo's")).toBe("Tom &amp; Jo&#39;s");
  });
});

describe("anonymous geocoding can't reach the billed fallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns no results instead of calling Google when Nominatim fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (url: any) => {
      if (String(url).includes("nominatim")) return new Response("blocked", { status: 503 });
      return new Response(JSON.stringify({ status: "OK", results: [] }));
    }) as any);
    const q = `anon-${Date.now()}`;
    const res = await request(app).get(`/api/v1/geocode?q=${q}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("maps.googleapis"))).toBe(false);
  });

  it("requires sign-in for reverse geocoding", async () => {
    const res = await request(app).get("/api/v1/reverse-geocode?lat=1&lon=2");
    expect(res.status).toBe(401);
  });
});

describe("health check", () => {
  it("answers 503 when the database is unreachable, and ping stays 200", async () => {
    const mongoose = (await import("mongoose")).default;
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0 as any);
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(503);
    expect(res.body.services.database).toBe("disconnected");
    vi.restoreAllMocks();
    expect((await request(app).get("/api/v1/ping")).status).toBe(200);
  });
});
