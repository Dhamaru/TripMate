/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";

describe("PUT /trips/:id validation", () => {
  let token: string;
  let id: string;
  beforeAll(async () => {
    await connectDB();
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    token = s.body.token;
    id = (
      await request(app)
        .post("/api/v1/trips")
        .set("Authorization", `Bearer ${token}`)
        .send(createTrip(s.body.user.id))
    ).body.id;
  });
  afterAll(async () => await closeDB());
  const put = (body: any) =>
    request(app).put(`/api/v1/trips/${id}`).set("Authorization", `Bearer ${token}`).send(body);

  it("accepts the edit form's normal payload", async () => {
    const res = await put({
      origin: "",
      destination: "Goa",
      days: 3,
      groupSize: 2,
      travelStyle: "relaxed",
      travelStyles: ["relaxed"],
      status: "planning",
      notes: "",
      budget: 5000,
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
    });
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(3);
  });

  it("rejects bad types and oversized free-form data", async () => {
    expect((await put({ days: 0 })).status).toBe(400);
    expect((await put({ status: "hacked" })).status).toBe(400);
    expect((await put({ costBreakdown: { blob: "x".repeat(30000) } })).status).toBe(400);
  });
});
