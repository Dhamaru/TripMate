/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../server/index";

describe("unknown API paths", () => {
  it("answer 404 JSON, not 401", async () => {
    for (const p of ["/api/v1/nope", "/api/v1/tripz/123", "/api/whatever"]) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(404);
      expect(res.body.code, p).toBe("NOT_FOUND");
    }
  });

  it("still require sign-in on real protected paths", async () => {
    for (const p of ["/api/v1/journal", "/api/v1/packing-lists", "/api/v1/packing/abc"]) {
      expect((await request(app).get(p)).status, p).toBe(401);
    }
  });
});
