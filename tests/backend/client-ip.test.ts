/** @vitest-environment node */
import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { config } from "../../server/config";
import { clientIpMiddleware } from "../../server/middleware/clientIp.middleware";

const app = express();
app.set("trust proxy", 1);
app.use(clientIpMiddleware);
app.get("/ip", (req, res) => res.json({ ip: req.ip }));

describe("clientIpMiddleware", () => {
  const original = config.NODE_ENV;
  afterEach(() => ((config as any).NODE_ENV = original));

  it("uses Cloudflare's client IP in production, so users don't share a rate-limit bucket", async () => {
    (config as any).NODE_ENV = "production";
    const res = await request(app)
      .get("/ip")
      .set("CF-Connecting-IP", "203.0.113.7")
      .set("X-Forwarded-For", "10.25.210.12");
    expect(res.body.ip).toBe("203.0.113.7");
  });

  it("ignores a malformed header and leaves req.ip alone outside production", async () => {
    (config as any).NODE_ENV = "production";
    const bad = await request(app).get("/ip").set("CF-Connecting-IP", "not-an-ip");
    expect(bad.body.ip).not.toBe("not-an-ip");
    (config as any).NODE_ENV = "development";
    const dev = await request(app).get("/ip").set("CF-Connecting-IP", "203.0.113.7");
    expect(dev.body.ip).not.toBe("203.0.113.7");
  });
});
