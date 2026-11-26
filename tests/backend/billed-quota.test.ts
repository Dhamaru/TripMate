/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../../server/config", async (orig) => {
  const mod: any = await orig();
  return {
    ...mod,
    config: {
      ...mod.config,
      GOOGLE_API_KEY: "test-key",
      GOOGLE_DAILY_USER_MAX: 3,
      GOOGLE_DAILY_GUEST_MAX: 1,
      GOOGLE_DAILY_GLOBAL_MAX: 6,
    },
  };
});

import request from "supertest";
import { http, HttpResponse } from "msw";
import { app } from "../../server/index";
import { server } from "../mocks/server";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";
import { takeGoogleQuota, UsageCounterModel } from "../../server/services/billedQuota";

describe("daily quota on billed Google calls", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("caps guests, signed-in users and the whole site separately", async () => {
    await UsageCounterModel.deleteMany({});
    const guest = { _id: "g1", isGuest: true };
    const user = { _id: "u1" };
    expect(await takeGoogleQuota(guest)).toBe(true);
    expect(await takeGoogleQuota(guest)).toBe(false); // guest max 1
    expect(await takeGoogleQuota(user)).toBe(true);
    expect(await takeGoogleQuota(user)).toBe(true);
    expect(await takeGoogleQuota(user)).toBe(true);
    expect(await takeGoogleQuota(user)).toBe(false); // user max 3
    // Refused calls don't use the site budget: 4 allowed so far, cap is 6.
    for (let i = 0; i < 5; i++) expect(await takeGoogleQuota(user)).toBe(false);
    expect(await takeGoogleQuota({ _id: "u2" })).toBe(true); // 5
    expect(await takeGoogleQuota(undefined)).toBe(true); // 6
    // Site-wide cap reached: everyone stops.
    expect(await takeGoogleQuota({ _id: "u3" })).toBe(false);
    expect(await takeGoogleQuota(undefined)).toBe(false);
  });

  it("refreshing a trip photo reuses cached search results", async () => {
    await UsageCounterModel.deleteMany({});
    let textSearches = 0;
    server.use(
      http.get("https://maps.googleapis.com/maps/api/place/textsearch/json", () => {
        textSearches++;
        return HttpResponse.json({
          status: "OK",
          results: [1, 2, 3].map((i) => ({
            name: `Spot ${i}`,
            photos: [{ photo_reference: `ref${i}` }],
          })),
        });
      }),
      http.get("https://en.wikipedia.org/w/api.php", () =>
        HttpResponse.json({ query: { pages: {} } }),
      ),
    );
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    const auth = { Authorization: `Bearer ${s.body.token}` };
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(auth)
      .send({ ...createTrip(s.body.user.id), destination: "Zzqx Valley" });
    const id = trip.body.id;
    await new Promise((r) => setTimeout(r, 300)); // background first fetch
    const before = textSearches;
    expect(before).toBeGreaterThan(0); // the first fetch really searched
    for (let i = 0; i < 4; i++) {
      expect((await request(app).post(`/api/v1/trips/${id}/image`).set(auth)).status).toBe(200);
    }
    expect(textSearches).toBe(before); // all refreshes served from the cache
  });
});
