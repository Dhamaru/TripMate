/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";

describe("share links", () => {
  let token: string;
  let id: string;
  beforeAll(async () => {
    await connectDB();
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    token = s.body.token;
    const t = createTrip(s.body.user.id) as any;
    t.itinerary = [
      {
        day: 1,
        activities: [
          {
            id: "a1",
            title: "Fort",
            time: "09:00 AM",
            type: "sightseeing",
            notes: "door code 1234",
            cost: 500,
            entryFee: 50,
          },
        ],
      },
    ];
    id = (await request(app).post("/api/v1/trips").set("Authorization", `Bearer ${token}`).send(t))
      .body.id;
  });
  afterAll(async () => await closeDB());
  const share = (isPublic: any) =>
    request(app)
      .post(`/api/v1/trips/${id}/share`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isPublic });

  it("shows only what the share page needs", async () => {
    const { body } = await share(true);
    const pub = await request(app).get(`/api/v1/trips/public/${body.shareId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.itinerary[0].activities[0]).toEqual({
      id: "a1",
      title: "Fort",
      time: "09:00 AM",
      type: "sightseeing",
    });
  });

  it("turning sharing off kills the old link; turning it on makes a new one", async () => {
    const first = (await share(true)).body.shareId;
    await share(false);
    expect((await request(app).get(`/api/v1/trips/public/${first}`)).status).toBe(404);
    const second = (await share(true)).body.shareId;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect((await request(app).get(`/api/v1/trips/public/${first}`)).status).toBe(404);
  });

  it("rejects a non-boolean isPublic", async () => {
    expect((await share("yes")).status).toBe(400);
  });
});
