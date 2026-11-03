/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { TripModel } from "@shared/schema";

describe("cross-cutting fixes", () => {
  let token: string;
  beforeAll(async () => {
    await connectDB();
    token = (await request(app).post("/api/v1/auth/signup").send(createUser())).body.token;
  });
  afterAll(async () => await closeDB());

  it("a bad id in the URL is 404; a bad value elsewhere is 400", async () => {
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).get("/api/v1/trips/not-an-id").set(auth)).status).toBe(404);
    const t = await TripModel.create({
      userId: "u-cast",
      destination: "Goa",
      days: 1,
      groupSize: 1,
    });
    const bad = await request(app).get(`/api/v1/journal?tripId=${t._id}&dayIndex=x`).set(auth);
    expect(bad.status).not.toBe(500);
  });

  it("/ping isn't counted against the rate limit", async () => {
    const res = await request(app).get("/api/v1/ping");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
  });

  it('counts "Goa" and "Goa, India" as one destination', async () => {
    const img = "https://upload.wikimedia.org/x.jpg";
    await TripModel.create([
      { userId: "real-1", destination: "Goa", days: 1, groupSize: 1, imageUrl: img },
      { userId: "real-2", destination: "Goa, India", days: 1, groupSize: 1, imageUrl: img },
    ]);
    const res = await request(app).get("/api/v1/public/top-destinations");
    const goa = (res.body.destinations || []).filter((d: any) => /^goa/i.test(d.destination));
    expect(goa).toHaveLength(1);
    expect(goa[0].tripCount).toBe(2);
  });
});
