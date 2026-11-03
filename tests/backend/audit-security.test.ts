/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../../server/config", async (orig) => {
  const mod: any = await orig();
  return {
    ...mod,
    config: {
      ...mod.config,
      ADMIN_SECRET: "admin-secret-1",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    },
  };
});

import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";
import { UserModel, TripModel, JournalEntryModel } from "@shared/schema";

describe("audit fixes: auth and access", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("counts every one of many parallel wrong passwords", async () => {
    const u = createUser();
    await request(app).post("/api/v1/auth/signup").send(u);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).post("/api/v1/auth/signin").send({ email: u.email, password: "wrong-pass" }),
      ),
    );
    const stored = await UserModel.findOne({ email: u.email }).lean();
    expect(stored!.failedLoginAttempts).toBe(8);
  });

  it("rejects a Google callback that doesn't carry this browser's state", async () => {
    const res = await request(app).get("/api/v1/auth/google/callback?code=attacker-code");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/signin?error=auth_failed");
  });

  it("answers 401, not 500, for a same-length non-ASCII admin secret", async () => {
    const res = await request(app).get("/api/v1/feedback").set("x-admin-secret", "ädmin-secret-");
    expect(res.status).toBe(401);
  });

  it("refuses a foreign CORS origin without a 500", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", "https://evil.example");
    expect(res.status).not.toBe(500);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("keeps the real trip id out of the public share response", async () => {
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    const auth = { Authorization: `Bearer ${s.body.token}` };
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(auth)
      .send(createTrip(s.body.user.id));
    const share = await request(app)
      .post(`/api/v1/trips/${trip.body.id}/share`)
      .set(auth)
      .send({ isPublic: true });
    const pub = await request(app).get(`/api/v1/trips/public/${share.body.shareId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.id).toBeUndefined();
    expect(pub.body._id).toBeUndefined();
    expect(pub.body.destination).toBe("Tokyo");
  });

  it("doesn't let guest accounts invite people", async () => {
    const g = await request(app).post("/api/v1/auth/guest");
    const auth = { Authorization: `Bearer ${g.body.token}` };
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(auth)
      .send(createTrip(g.body.user.id));
    const res = await request(app)
      .post(`/api/v1/trips/${trip.body.id}/collaborators`)
      .set(auth)
      .send({ email: "someone@example.com", role: "viewer" });
    expect(res.status).toBe(400);
  });
});

describe("audit fixes: journal photos", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("lists photo URLs instead of inline images and serves each photo", async () => {
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    const auth = { Authorization: `Bearer ${s.body.token}` };
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const entry = await JournalEntryModel.create({
      userId: s.body.user.id,
      title: "Day one",
      content: "Walked around",
      photos: [`data:image/png;base64,${png.toString("base64")}`],
    });
    const list = await request(app).get("/api/v1/journal?light=true").set(auth);
    expect(list.status).toBe(200);
    const photoUrl: string = list.body[0].photos[0];
    expect(photoUrl.startsWith(`/api/v1/journal/${entry.id}/photos/0`)).toBe(true);
    const photo = await request(app).get(photoUrl).set(auth);
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(photo.body, png)).toBe(0);

    // Another account can't read it.
    const other = await request(app).post("/api/v1/auth/signup").send(createUser());
    const denied = await request(app)
      .get(photoUrl)
      .set({ Authorization: `Bearer ${other.body.token}` });
    expect(denied.status).toBe(404);
  });

  it("answers 413 when new photos together are too large", async () => {
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    const big = Buffer.alloc(2.9 * 1024 * 1024, 1);
    let req = request(app)
      .post("/api/v1/journal")
      .set({ Authorization: `Bearer ${s.body.token}` })
      .field("title", "Big")
      .field("content", "Too many photos");
    for (let i = 0; i < 4; i++) {
      req = req.attach("photos", big, { filename: `p${i}.jpg`, contentType: "image/jpeg" });
    }
    expect((await req).status).toBe(413);
  });
});

describe("audit fixes: landing showcase", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("tidies all-caps names, merges spelling variants and ignores user-set images", async () => {
    const owner = (await UserModel.create({ _id: "real-1", email: "traveler@gmail.com" }))._id;
    const wiki = "https://upload.wikimedia.org/x.jpg";
    await TripModel.create([
      { ...createTrip(owner), destination: "MANALI", imageUrl: wiki },
      { ...createTrip(owner), destination: "Visakhapatnam", imageUrl: wiki },
      { ...createTrip(owner), destination: "VISHAKAPATNAM", imageUrl: wiki },
      {
        ...createTrip(owner),
        destination: "Cheap visas here",
        imageUrl: "https://spam.example/a.png",
      },
    ]);
    const res = await request(app).get("/api/v1/public/top-destinations");
    const names = res.body.destinations.map((d: any) => d.destination);
    expect(names).toContain("Manali");
    expect(names.filter((n: string) => /vi(s|sh)akh?apatnam/i.test(n))).toHaveLength(1);
    expect(names).not.toContain("Cheap visas here");
  });
});
