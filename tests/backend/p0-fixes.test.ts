/** @vitest-environment node */
/**
 * Regression tests for the P0 findings from the 2026-09-03 five-expert
 * review (design/architecture/QA/product/growth audit). Each test pins
 * down the exact live-reproduced failure scenario the review documented,
 * not just a generic "does this endpoint work" check.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB, clearDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";

describe("P0 fixes — five-expert review, 2026-09-03", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await connectDB();
  });
  afterAll(async () => await closeDB());

  beforeEach(async () => {
    await clearDB();
    const userData = createUser();
    const signupRes = await request(app).post("/api/v1/auth/signup").send(userData);
    token = signupRes.body.token;
    userId = signupRes.body.user.id;
  });

  describe("rate limiting actually applies to the /api/tools back-compat alias", () => {
    it("carries a ratelimit-limit header on a request through /api/tools, not just /api/v1", async () => {
      // Was app.use("/api/v1", generalLimiter) — path-scoped, so anything
      // mounted outside that exact prefix (the /api/tools and /api/auth
      // back-compat aliases in server/index.ts) was completely
      // unprotected: unauthenticated, unlimited, including a route that
      // makes a billed Google Places Photo call per request. Fixed by
      // mounting the limiter with no path (applies to every request the
      // app handles) instead of scoping it to one prefix.
      const res = await request(app).get("/api/tools/ping");
      expect(
        res.headers["ratelimit-limit"],
        "ratelimit-limit header present on /api/tools",
      ).toBeDefined();
    });

    it("still carries the header on the primary /api/v1 prefix (no regression)", async () => {
      const res = await request(app).get("/api/v1/ping");
      expect(res.headers["ratelimit-limit"]).toBeDefined();
    });
  });

  describe("logs router no longer throttles unrelated /api/v1 traffic", () => {
    it("20 sequential GET /api/v1/trips calls (well over the old 10/60s logs ceiling) all succeed", async () => {
      // Was router.use(logsLimiter) in logs.routes.ts — a router-wide
      // middleware with no path filter runs for EVERY request that
      // enters that router, not just ones matching its own /logs/*
      // routes. Because the router is mounted at the shared /api/v1
      // prefix, ordinary navigation silently passed through a
      // 10-request/60-second ceiling meant only for client error
      // logging before ever reaching its real handler — live-reproduced
      // as a real account's trips list rendering "No trips yet" under
      // normal browsing. Fixed by attaching the limiter to the two
      // /logs/* routes directly instead of router-wide.
      for (let i = 0; i < 20; i++) {
        const res = await request(app).get("/api/v1/trips").set("Authorization", `Bearer ${token}`);
        expect(res.status, `request #${i + 1}`).toBe(200);
      }
    });
  });

  describe("public trip share does not leak voter identity via userVotes either", () => {
    it("strips userVotes from every itinerary activity in the public response, keeps the numeric vote total", async () => {
      // Caught by a security-review pass on the getPublicTrip fix itself
      // (finding #1's projection correctly dropped userId/collaborators/
      // expenses/budget/notes, but kept `itinerary` wholesale -- a
      // Mixed-typed subtree, so toggleVote's userVotes.<userId> map,
      // keyed by the literal voter's user id (their raw email for a
      // Google-signup account), still shipped verbatim one level down).
      const tripRes = await request(app)
        .post("/api/v1/trips")
        .set("Authorization", `Bearer ${token}`)
        .send(
          createTrip(userId, {
            destination: "Lisbon",
            itinerary: [{ dayIndex: 0, day: 1, activities: [] }],
          } as any),
        );
      const tripId = tripRes.body.id;

      const addRes = await request(app)
        .post(`/api/v1/trips/${tripId}/itinerary/activity`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayIndex: 0, activity: { title: "Belem Tower", type: "sightseeing" } });
      const activityId = addRes.body.itinerary[0].activities[0].id;

      const voteRes = await request(app)
        .post(`/api/v1/trips/${tripId}/itinerary/vote`)
        .set("Authorization", `Bearer ${token}`)
        .send({ dayIndex: 0, activityId, vote: 1 });
      expect(voteRes.status).toBe(200);

      const shareRes = await request(app)
        .post(`/api/v1/trips/${tripId}/share`)
        .set("Authorization", `Bearer ${token}`)
        .send({ isPublic: true });
      const shareId = shareRes.body.shareId;

      const publicRes = await request(app).get(`/api/v1/trips/public/${shareId}`);
      expect(publicRes.status).toBe(200);
      const publicActivity = publicRes.body.itinerary[0].activities[0];
      expect(
        publicActivity.userVotes,
        "userVotes (keyed by voter user id / email) must not be in the public response",
      ).toBeUndefined();
      // The non-identifying numeric total is fine to keep.
      expect(publicActivity.votes).toBe(1);
    });
  });

  describe("public trip share no longer leaks private data", () => {
    it("omits expenses, notes, budget, userId, and collaborators from the public response", async () => {
      const tripRes = await request(app)
        .post("/api/v1/trips")
        .set("Authorization", `Bearer ${token}`)
        .send(
          createTrip(userId, {
            destination: "Paris",
            notes: "a private note nobody else should see",
            budget: 50000,
          }),
        );
      const tripId = tripRes.body.id;

      // Add a real expense with a free-text description — this is the
      // specific data class the review found leaking.
      await request(app)
        .post(`/api/v1/trips/${tripId}/expenses`)
        .set("Authorization", `Bearer ${token}`)
        .send({ amount: 4200, currency: "INR", category: "Food", description: "dinner w/ Priya" });

      const shareRes = await request(app)
        .post(`/api/v1/trips/${tripId}/share`)
        .set("Authorization", `Bearer ${token}`)
        .send({ isPublic: true });
      expect(shareRes.status).toBe(200);
      const shareId = shareRes.body.shareId;
      expect(shareId, "shareId minted").toBeTruthy();

      // Public route — no Authorization header, this is the
      // unauthenticated path anyone with the link can hit.
      const publicRes = await request(app).get(`/api/v1/trips/public/${shareId}`);
      expect(publicRes.status).toBe(200);

      expect(publicRes.body.destination).toBe("Paris");
      expect(
        publicRes.body.expenses,
        "expenses must not be in the public response",
      ).toBeUndefined();
      expect(publicRes.body.notes, "notes must not be in the public response").toBeUndefined();
      expect(publicRes.body.budget, "budget must not be in the public response").toBeUndefined();
      expect(
        publicRes.body.userId,
        "owner userId must not be in the public response",
      ).toBeUndefined();
      expect(
        publicRes.body.collaborators,
        "collaborators must not be in the public response",
      ).toBeUndefined();
    });

    it("a non-public trip is still not reachable via the public route", async () => {
      const tripRes = await request(app)
        .post("/api/v1/trips")
        .set("Authorization", `Bearer ${token}`)
        .send(createTrip(userId, { destination: "Tokyo" }));
      const tripId = tripRes.body.id;

      const publicRes = await request(app).get(`/api/v1/trips/public/${tripId}`);
      expect(publicRes.status).toBe(404);
    });
  });

  describe("Atlas's chat/stream route rejects a cross-site top-level navigation shape", () => {
    it("403s a request carrying Sec-Fetch-Mode: navigate / Sec-Fetch-Site: cross-site", async () => {
      // The exploit: an authenticated GET route can't use the normal
      // CSRF header check (SAFE_METHODS always skips GET, and the
      // client opens this with a native EventSource which cannot send
      // a custom header anyway). sameSite:"lax" on the auth cookie IS
      // sent on a top-level cross-site navigation, so a malicious page
      // doing window.location = ".../chat/stream?message=..." could run
      // Atlas, including unconfirmed destructive tools, as the victim.
      // Browsers attach Fetch Metadata headers to every request and a
      // page's own JS cannot spoof them — a navigation is
      // distinguishable from EventSource's own real request shape.
      const res = await request(app)
        .get("/api/v1/agent/chat/stream?message=hi")
        .set("Authorization", `Bearer ${token}`)
        .set("Sec-Fetch-Mode", "navigate")
        .set("Sec-Fetch-Site", "cross-site");
      expect(res.status).toBe(403);
    });

    it("does not reject the real EventSource request shape (same-origin, cors mode)", async () => {
      const res = await request(app)
        .get("/api/v1/agent/chat/stream?message=hi")
        .set("Authorization", `Bearer ${token}`)
        .set("Sec-Fetch-Mode", "cors")
        .set("Sec-Fetch-Site", "same-origin");
      // Not asserting 200 here — the real handler needs a live AI
      // provider and a valid SSE client to fully exercise. Asserting it
      // is NOT the 403 the cross-site-navigation guard would produce is
      // the actual regression this test protects against. Passing the
      // guard means the request proceeds into a real Atlas agent-loop
      // call, same real-provider latency as this suite's other
      // AI-dependent tests — hence the longer timeout.
      expect(res.status).not.toBe(403);
    }, 30000);

    it("does not reject a request with no Sec-Fetch-* headers at all (older browsers, direct API clients)", async () => {
      const res = await request(app)
        .get("/api/v1/agent/chat/stream?message=hi")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).not.toBe(403);
    }, 30000);
  });

  describe("itinerary activity edits persist the full field set, not just time/title/notes", () => {
    it("cost, type, address, placeName, duration, and coordinates all survive an edit", async () => {
      const tripRes = await request(app)
        .post("/api/v1/trips")
        .set("Authorization", `Bearer ${token}`)
        .send(
          createTrip(userId, {
            destination: "Delhi",
            itinerary: [{ dayIndex: 0, day: 1, activities: [] }],
          } as any),
        );
      const tripId = tripRes.body.id;

      const addRes = await request(app)
        .post(`/api/v1/trips/${tripId}/itinerary/activity`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          dayIndex: 0,
          activity: { title: "Red Fort Visit", type: "sightseeing", cost: 100 },
        });
      expect(addRes.status).toBe(201);
      const activityId = addRes.body.itinerary[0].activities[0].id;

      const updateRes = await request(app)
        .put(`/api/v1/trips/${tripId}/itinerary/activity/${activityId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          dayIndex: 0,
          data: {
            title: "Humayun Tomb Visit",
            placeName: "Humayun Tomb",
            address: "Nizamuddin, Delhi",
            type: "museum",
            cost: 999,
            entryFee: 50,
            duration_minutes: 90,
            lat: 28.5933,
            lon: 77.2507,
          },
        });
      expect(updateRes.status).toBe(200);

      const day = updateRes.body.itinerary.find((d: any) => d.dayIndex === 0);
      const activity = day.activities.find((a: any) => a.id === activityId);
      expect(activity.title).toBe("Humayun Tomb Visit");
      expect(activity.placeName, "placeName was previously silently dropped").toBe("Humayun Tomb");
      expect(activity.address, "address was previously silently dropped").toBe("Nizamuddin, Delhi");
      expect(activity.type, "type was previously silently dropped").toBe("museum");
      expect(activity.cost, "cost was previously silently dropped").toBe(999);
      expect(activity.entryFee, "entryFee was previously silently dropped").toBe(50);
      expect(activity.duration_minutes, "duration_minutes was previously silently dropped").toBe(
        90,
      );
      expect(activity.lat, "lat was previously silently dropped").toBe(28.5933);
      expect(activity.lon, "lon was previously silently dropped").toBe(77.2507);
    });
  });
});
