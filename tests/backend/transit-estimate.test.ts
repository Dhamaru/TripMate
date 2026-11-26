/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { http, HttpResponse } from "msw";
import { app } from "../../server/index";
import { server } from "../mocks/server";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";
import { TripModel } from "@shared/schema";
import { estimateTransitINR, refreshTransitEstimate } from "../../server/services/transitEstimate";

const PLACES: Record<string, [string, string]> = {
  Delhi: ["28.6139", "77.2090"],
  Mumbai: ["19.0760", "72.8777"],
};

function mockServices() {
  server.use(
    http.get("https://nominatim.openstreetmap.org/search", ({ request }) => {
      const q = new URL(request.url).searchParams.get("q") || "";
      const hit = PLACES[q];
      return HttpResponse.json(hit ? [{ lat: hit[0], lon: hit[1] }] : []);
    }),
    http.get("https://api.frankfurter.app/latest", () =>
      HttpResponse.json({ rates: { USD: 0.012 } }),
    ),
  );
}

describe("getting-there estimate", () => {
  it("prices round trips for the group by distance", () => {
    expect(estimateTransitINR(10, 2)).toBe(0); // same city
    expect(estimateTransitINR(500, 1)).toBe(1900); // train: (200 + 1.5*500) * 2
    expect(estimateTransitINR(1150, 2)).toBe(28700); // flight: (2000 + 4.5*1150) * 2 people * 2
    expect(estimateTransitINR(200, 5, "car")).toBe(7200); // 9/km * 2 cars * 2 ways
    expect(estimateTransitINR(200, 1, undefined, true)).toBe(5800); // international -> flight
    expect(estimateTransitINR(500, 1, "toString")).toBe(1900); // unknown mode -> by distance
  });

  let token: string;
  let id: string;
  beforeAll(async () => {
    await connectDB();
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    token = s.body.token;
    const trip = await TripModel.create({
      ...createTrip(s.body.user.id),
      userId: s.body.user.id,
      origin: "Delhi",
      destination: "Mumbai",
      groupSize: 2,
      currency: "USD",
    });
    id = trip.id;
  });
  afterAll(async () => await closeDB());
  const put = (body: any) =>
    request(app).put(`/api/v1/trips/${id}`).set("Authorization", `Bearer ${token}`).send(body);

  it("stores the estimate in the trip currency", async () => {
    mockServices();
    await refreshTransitEstimate(id);
    const trip = await TripModel.findById(id).lean();
    // ~1150 km Delhi-Mumbai, flight for 2, round trip ≈ ₹28.7k ≈ $344
    expect(trip!.transitEstimate).toBeGreaterThan(300);
    expect(trip!.transitEstimate).toBeLessThan(400);
  });

  it("keeps a removed estimate when the edit form resends the same route", async () => {
    expect((await put({ transitEstimate: 0 })).body.transitEstimate).toBe(0);
    const res = await put({ origin: "Delhi", destination: "Mumbai", groupSize: 2, notes: "x" });
    expect(res.body.transitEstimate).toBe(0);
  });

  it("keeps a removed estimate removed when only the group size changes", async () => {
    const res = await put({ groupSize: 3, isInternational: false, currency: "usd" });
    expect(res.body.transitEstimate).toBe(0);
  });

  it("clears the estimate when the route really changes", async () => {
    const res = await put({ origin: "Pune" });
    expect(res.status).toBe(200);
    expect(res.body.transitEstimate).toBeUndefined();
  });

  it("falls back to Photon when Nominatim refuses the server", async () => {
    server.use(
      http.get(
        "https://nominatim.openstreetmap.org/search",
        () => new HttpResponse(null, { status: 403 }),
      ),
      http.get("https://photon.komoot.io/api/", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") || "";
        const at = q.startsWith("Shimla") ? [77.1734, 31.1048] : [76.7794, 30.7333]; // Chandigarh
        return HttpResponse.json({ features: [{ geometry: { coordinates: at } }] });
      }),
    );
    const t = await TripModel.create({
      ...createTrip("u-photon"),
      userId: "u-photon",
      origin: "Shimla, Himachal Pradesh",
      destination: "Chandigarh",
      transportMode: "bus",
      groupSize: 1,
      currency: "INR",
    });
    await refreshTransitEstimate(t.id);
    // ~50 km by bus, round trip: (100 + 1.5*km) * 2 ≈ 350
    const saved = (await TripModel.findById(t.id).lean())!.transitEstimate!;
    expect(saved).toBeGreaterThan(300);
    expect(saved).toBeLessThan(450);
  });

  it("rejects a negative estimate", async () => {
    expect((await put({ transitEstimate: -5 })).status).toBe(400);
  });
});
