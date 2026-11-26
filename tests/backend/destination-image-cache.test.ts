/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { TripModel } from "@shared/schema";

// Landing images: fetched upstream once, then served from memory.
describe("destination image cache", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => {
    vi.restoreAllMocks();
    await closeDB();
  });

  it("fetches upstream once for repeated requests", async () => {
    await TripModel.create({
      userId: "real-x",
      destination: "Hampi",
      days: 1,
      groupSize: 1,
      imageUrl: "https://upload.wikimedia.org/hampi.jpg",
    });
    await request(app).get("/api/v1/public/top-destinations");
    const realFetch = globalThis.fetch;
    const upstream = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation((async (u: any, o: any) =>
      String(u).includes("wikimedia") ? upstream() : realFetch(u, o)) as any);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/api/v1/public/destination-image?d=Hampi");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/jpeg");
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
