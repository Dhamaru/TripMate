/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB, clearDB } from "../helpers/db";
import { createUser, createTrip, createJournalEntry } from "../helpers/factories";

describe("Journal API", () => {
  let token: string;
  let userId: string;
  let tripId: string;

  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  beforeEach(async () => {
    await clearDB();
    const userData = createUser();
    const signupRes = await request(app).post("/api/v1/auth/signup").send(userData);
    token = signupRes.body.token;
    userId = signupRes.body.user.id;

    const tripRes = await request(app)
      .post("/api/v1/trips")
      .set("Authorization", `Bearer ${token}`)
      .send(createTrip(userId));
    tripId = tripRes.body.id;
  });

  it("should create a journey entry", async () => {
    // journal.routes.ts defines /journal (not /trips/:id/journal) —
    // tripId travels in the body.
    const res = await request(app)
      .post("/api/v1/journal")
      .set("Authorization", `Bearer ${token}`)
      .send({ tripId, title: "First Day in Tokyo", content: "Beautiful sunset." });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("First Day in Tokyo");
  });

  it("should list all entries for a trip", async () => {
    await request(app)
      .post("/api/v1/journal")
      .set("Authorization", `Bearer ${token}`)
      .send(createJournalEntry(tripId, { title: "Day 1" }));

    const res = await request(app)
      .get(`/api/v1/journal?tripId=${tripId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  // A phone photo is ~1MB+ as base64; echoing it back in a form field hit
  // multer's 1MB field limit and every edit of such an entry returned 500.
  it("edits an entry with a large photo, keeping it by position", async () => {
    const photo = Buffer.alloc(1.5 * 1024 * 1024, 1);
    const created = await request(app)
      .post("/api/v1/journal")
      .set("Authorization", `Bearer ${token}`)
      .field("tripId", tripId)
      .field("title", "Beach")
      .field("content", "Sand")
      .attach("photos", photo, { filename: "a.jpg", contentType: "image/jpeg" });
    expect(created.status).toBe(201);
    const stored = created.body.photos[0];

    const res = await request(app)
      .put(`/api/v1/journal/${created.body.id || created.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("title", "Beach day")
      .field("existingPhotoIndexes", JSON.stringify([0, 5, "x"]));
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Beach day");
    expect(res.body.photos).toEqual([stored]);
  });

  it("ignores photo strings the entry does not already have", async () => {
    const created = await request(app)
      .post("/api/v1/journal")
      .set("Authorization", `Bearer ${token}`)
      .send({ tripId, title: "x", content: "y" });
    const res = await request(app)
      .put(`/api/v1/journal/${created.body.id || created.body._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("existingPhotos", JSON.stringify(["https://evil.example/x.png"]));
    expect(res.status).toBe(200);
    expect(res.body.photos).toEqual([]);
  });

  it("refuses stale photo positions and malformed lists instead of losing photos", async () => {
    const created = await request(app)
      .post("/api/v1/journal")
      .set("Authorization", `Bearer ${token}`)
      .field("tripId", tripId)
      .field("title", "Beach")
      .field("content", "Sand")
      .attach("photos", Buffer.alloc(10, 1), { filename: "a.jpg", contentType: "image/jpeg" });
    const url = `/api/v1/journal/${created.body.id || created.body._id}`;

    const stale = await request(app)
      .put(url)
      .set("Authorization", `Bearer ${token}`)
      .field("existingPhotoIndexes", "[0]")
      .field("photoCount", "2");
    expect(stale.status).toBe(409);

    const bad = await request(app)
      .put(url)
      .set("Authorization", `Bearer ${token}`)
      .field("existingPhotoIndexes", "{}");
    expect(bad.status).toBe(400);

    const after = await request(app).get(url).set("Authorization", `Bearer ${token}`);
    expect(after.body.photos).toHaveLength(1);
  });
});
