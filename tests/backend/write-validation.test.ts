/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser } from "../helpers/factories";

describe("write routes reject bad input", () => {
  let token: string;
  beforeAll(async () => {
    await connectDB();
    token = (await request(app).post("/api/v1/auth/signup").send(createUser())).body.token;
  });
  afterAll(async () => await closeDB());
  const post = (p: string, body: any) =>
    request(app).post(p).set("Authorization", `Bearer ${token}`).send(body);

  it("crowd report with impossible coordinates or density", async () => {
    expect(
      (await post("/api/v1/crowd/density", { latitude: 999, longitude: 78, density: 5 })).status,
    ).toBe(400);
    expect(
      (await post("/api/v1/crowd/density", { latitude: 17, longitude: 78, density: 50 })).status,
    ).toBe(400);
    expect(
      (await post("/api/v1/crowd/density", { latitude: 17.36, longitude: 78.47, density: 5 }))
        .status,
    ).toBe(201);
  });

  it("map pin with out-of-range coordinates or no name", async () => {
    expect(
      (await post("/api/v1/map-pins", { lat: 200, lng: 78, name: "x", color: "red" })).status,
    ).toBe(400);
    expect(
      (await post("/api/v1/map-pins", { lat: 17, lng: 78, name: "", color: "red" })).status,
    ).toBe(400);
    expect(
      (await post("/api/v1/map-pins", { lat: 17, lng: 78, name: "Cafe", color: "#b3261e" })).status,
    ).toBe(201);
    // The colour lands in map-marker HTML, so only hex values are accepted.
    expect(
      (await post("/api/v1/map-pins", { lat: 17, lng: 78, name: "Cafe", color: "red;x" })).status,
    ).toBe(400);
  });

  it("journal entries can't set server-owned fields", async () => {
    const res = await post("/api/v1/journal", {
      title: "t",
      content: "c",
      isRecap: true,
      recapMeta: { fake: 1 },
    });
    expect(res.status).toBe(201);
    expect(res.body.isRecap).not.toBe(true);
    expect(res.body.recapMeta).toBeUndefined();
  });
});
