/** @vitest-environment node */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { nanoid } from "nanoid";
import { modifyItineraryHandler } from "../../server/agent/tools/handlers/modifyItineraryHandler";
import { tripHandler } from "../../server/agent/tools/handlers/tripHandler";
import { TripModel, UserModel } from "../../shared/schema";
import { connectDB, closeDB, clearDB } from "../helpers/db";

function makeFakeTrip(overrides?: Record<string, any>) {
  return {
    _id: "tripXYZ",
    userId: "userXYZ",
    destination: "Jaipur",
    itinerary: [{ day: 1, activities: [] }],
    updatedAt: new Date(),
    collaborators: [],
    currency: "INR",
    travelStyle: "cultural",
    budget: 10000,
    ...overrides,
  };
}

function makeMockTripModel(
  trip: ReturnType<typeof makeFakeTrip>,
  captureActivities?: (acts: any[]) => void,
) {
  return {
    findOne: vi.fn().mockResolvedValue(trip),
    findOneAndUpdate: vi.fn().mockImplementation((_f: any, update: any) => {
      const it2 = (update || {})["$set"]?.itinerary ?? trip.itinerary;
      if (captureActivities) captureActivities(it2?.[0]?.activities ?? []);
      return Promise.resolve({ ...trip, itinerary: it2 });
    }),
  };
}

describe("Bug 1a -- normalizeActivityTitle (via modifyItineraryHandler)", () => {
  it("converts shouting-case multi-word title to title-case", async () => {
    const captured: any[] = [];
    const TM = makeMockTripModel(makeFakeTrip(), (a) => captured.push(...a));
    const r = await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "add_activity",
        dayIndex: 0,
        activity: { title: "SRI RUDRA BIRYANI PALACE", type: "restaurant" },
      },
      { TripModel: TM as any },
    );
    expect(r.success).toBe(true);
    expect(captured[0].title).toBe("Sri Rudra Biryani Palace");
  });

  it("does NOT mangle single-word acronym (KFC, no space)", async () => {
    const captured: any[] = [];
    const TM = makeMockTripModel(makeFakeTrip(), (a) => captured.push(...a));
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "add_activity",
        dayIndex: 0,
        activity: { title: "KFC", type: "restaurant" },
      },
      { TripModel: TM as any },
    );
    expect(captured[0].title).toBe("KFC");
  });

  it("strips stray trailing dot", async () => {
    const captured: any[] = [];
    const TM = makeMockTripModel(makeFakeTrip(), (a) => captured.push(...a));
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "add_activity",
        dayIndex: 0,
        activity: { title: "The Brewery.", type: "restaurant" },
      },
      { TripModel: TM as any },
    );
    expect(captured[0].title).toBe("The Brewery");
  });

  it("normalizes title via replace_day", async () => {
    const captured: any[] = [];
    const TM = makeMockTripModel(makeFakeTrip(), (a) => captured.push(...a));
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "replace_day",
        dayIndex: 0,
        activities: [
          { title: "AMBER FORT JAIPUR", type: "sightseeing", time: "09:00 AM" },
          { title: "City Palace", type: "sightseeing", time: "11:00 AM" },
        ],
      },
      { TripModel: TM as any },
    );
    expect(captured[0].title).toBe("Amber Fort Jaipur");
    expect(captured[1].title).toBe("City Palace");
  });

  it("normalizes title AND placeName via swap_activities", async () => {
    const captured: any[] = [];
    const ea = { id: "act1", title: "Old Place", type: "sightseeing", time: "10:00 AM" };
    const TM = makeMockTripModel(makeFakeTrip({ itinerary: [{ day: 1, activities: [ea] }] }), (a) =>
      captured.push(...a),
    );
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "swap_activities",
        dayIndex: 0,
        activityId: "act1",
        activity: { title: "HAWA MAHAL", placeName: "HAWA MAHAL", type: "sightseeing" },
      },
      { TripModel: TM as any },
    );
    expect(captured[0].title).toBe("Hawa Mahal");
    expect(captured[0].placeName).toBe("Hawa Mahal");
  });
});

describe("Bug 1b -- tryResolveCoords: resolveCoordinates(name, destination)", () => {
  it("add_activity: called with (placeName, destination), NOT just address", async () => {
    const rc = vi.fn().mockResolvedValue({ lat: 26.9124, lon: 75.7873 });
    const TM = makeMockTripModel(makeFakeTrip());
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "add_activity",
        dayIndex: 0,
        activity: {
          title: "Amber Fort",
          placeName: "Amber Fort",
          address: "Devisinghpura, Amer, Jaipur, Rajasthan 302001",
          type: "sightseeing",
        },
      },
      { TripModel: TM as any, aiService: { resolveCoordinates: rc } },
    );
    expect(rc).toHaveBeenCalledTimes(1);
    expect(rc).toHaveBeenCalledWith("Amber Fort", "Jaipur");
    // Pre-fix bug: was resolveCoordinates(act.address) -- one arg, destination undefined
    expect(rc).not.toHaveBeenCalledWith("Devisinghpura, Amer, Jaipur, Rajasthan 302001");
    expect(rc).not.toHaveBeenCalledWith("Devisinghpura, Amer, Jaipur, Rajasthan 302001", undefined);
  });

  it("falls back to title when placeName absent", async () => {
    const rc = vi.fn().mockResolvedValue({ lat: 26.9, lon: 75.8 });
    const TM = makeMockTripModel(makeFakeTrip());
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "add_activity",
        dayIndex: 0,
        activity: { title: "Jantar Mantar", address: "Gangori Bazar, Jaipur", type: "sightseeing" },
      },
      { TripModel: TM as any, aiService: { resolveCoordinates: rc } },
    );
    expect(rc).toHaveBeenCalledWith("Jantar Mantar", "Jaipur");
  });

  it("swap_activities: also called with (name, destination)", async () => {
    const rc = vi.fn().mockResolvedValue({ lat: 26.9239, lon: 75.8267 });
    const ea = { id: "act1", title: "Old", type: "sightseeing", time: "10:00 AM" };
    const TM = makeMockTripModel(makeFakeTrip({ itinerary: [{ day: 1, activities: [ea] }] }));
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "swap_activities",
        dayIndex: 0,
        activityId: "act1",
        activity: {
          title: "Hawa Mahal",
          placeName: "Hawa Mahal",
          address: "Jaipur Rd",
          type: "sightseeing",
        },
      },
      { TripModel: TM as any, aiService: { resolveCoordinates: rc } },
    );
    expect(rc).toHaveBeenCalledWith("Hawa Mahal", "Jaipur");
  });

  it("replace_day: called once per activity without existing coords", async () => {
    const rc = vi.fn().mockResolvedValue({ lat: 26.9, lon: 75.8 });
    const TM = makeMockTripModel(makeFakeTrip());
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "replace_day",
        dayIndex: 0,
        activities: [
          { title: "Jantar Mantar", type: "sightseeing", time: "09:00 AM" },
          { title: "City Palace", type: "sightseeing", time: "11:00 AM" },
        ],
      },
      { TripModel: TM as any, aiService: { resolveCoordinates: rc } },
    );
    expect(rc).toHaveBeenCalledTimes(2);
    expect(rc).toHaveBeenCalledWith("Jantar Mantar", "Jaipur");
    expect(rc).toHaveBeenCalledWith("City Palace", "Jaipur");
  });

  it("skipped when activity already has latitude set", async () => {
    const rc = vi.fn();
    const TM = makeMockTripModel(makeFakeTrip());
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "add_activity",
        dayIndex: 0,
        activity: {
          title: "Hawa Mahal",
          latitude: 26.9239,
          longitude: 75.8267,
          type: "sightseeing",
        },
      },
      { TripModel: TM as any, aiService: { resolveCoordinates: rc } },
    );
    expect(rc).not.toHaveBeenCalled();
  });

  it("resolved coords are written into the stored activity", async () => {
    const rc = vi.fn().mockResolvedValue({ lat: 26.9124, lon: 75.7873 });
    const captured: any[] = [];
    const TM = makeMockTripModel(makeFakeTrip(), (a) => captured.push(...a));
    await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "add_activity",
        dayIndex: 0,
        activity: { title: "Jantar Mantar", type: "sightseeing" },
      },
      { TripModel: TM as any, aiService: { resolveCoordinates: rc } },
    );
    expect(captured[0].latitude).toBe(26.9124);
    expect(captured[0].longitude).toBe(75.7873);
  });

  it("geocoding failure does NOT fail the handler (best-effort, silently caught)", async () => {
    const rc = vi.fn().mockRejectedValue(new Error("geocode unavailable"));
    const TM = makeMockTripModel(makeFakeTrip());
    const r = await modifyItineraryHandler(
      {
        tripId: "tripXYZ",
        userId: "userXYZ",
        action: "add_activity",
        dayIndex: 0,
        activity: { title: "Some Place", type: "sightseeing" },
      },
      { TripModel: TM as any, aiService: { resolveCoordinates: rc } },
    );
    expect(r.success).toBe(true);
  });
});

describe("Bug 2 -- tripHandler get: cuisine/dietary preference surfacing", () => {
  let userId: string;
  beforeAll(async () => {
    await connectDB();
  });
  afterAll(async () => {
    await closeDB();
  });
  beforeEach(async () => {
    await clearDB();
    userId = nanoid(10);
    await UserModel.create({
      _id: userId,
      email: "user_" + userId + "@example.com",
      password: "hashed",
      firstName: "Test",
      lastName: "User",
      provider: "local",
      isVerified: true,
      cuisinePreferences: ["Italian", "Mexican"],
      dietaryPreferences: ["Gluten-free"],
    });
  });

  async function mkTrip(o?: Record<string, any>) {
    return TripModel.create({
      userId,
      destination: "Jaipur",
      origin: "Delhi",
      startDate: new Date("2026-10-01"),
      endDate: new Date("2026-10-05"),
      budget: 5000,
      currency: "INR",
      days: 4,
      groupSize: 2,
      travelStyle: "cultural",
      status: "planning",
      itinerary: [],
      ...o,
    });
  }

  it("cuisinePreferences + dietaryPreferences keys exist in returned data (absent pre-fix)", async () => {
    const trip = await mkTrip({
      cuisinePreferences: ["South Indian"],
      dietaryPreferences: ["Vegetarian"],
    });
    const r = await tripHandler({ tripId: String(trip._id), userId, action: "get" });
    expect(r.success).toBe(true);
    expect("cuisinePreferences" in (r.data as any)).toBe(true);
    expect("dietaryPreferences" in (r.data as any)).toBe(true);
  });

  it("returns trip-level prefs when both non-empty; profile prefs do NOT bleed through", async () => {
    const trip = await mkTrip({
      cuisinePreferences: ["South Indian", "Seafood"],
      dietaryPreferences: ["Vegetarian"],
    });
    const r = await tripHandler({ tripId: String(trip._id), userId, action: "get" });
    expect(r.success).toBe(true);
    expect(r.data.cuisinePreferences).toEqual(["South Indian", "Seafood"]);
    expect(r.data.dietaryPreferences).toEqual(["Vegetarian"]);
    expect(r.data.cuisinePreferences).not.toContain("Italian");
    expect(r.data.dietaryPreferences).not.toContain("Gluten-free");
  });

  it("falls back to profile when trip has neither array (via $unset to simulate legacy)", async () => {
    const tripDoc = await mkTrip({});
    await TripModel.updateOne(
      { _id: tripDoc._id },
      { $unset: { cuisinePreferences: "", dietaryPreferences: "" } },
    );
    const r = await tripHandler({ tripId: String(tripDoc._id), userId, action: "get" });
    expect(r.success).toBe(true);
    expect(r.data.cuisinePreferences).toEqual(["Italian", "Mexican"]);
    expect(r.data.dietaryPreferences).toEqual(["Gluten-free"]);
  });

  it("NO fallback when trip has only dietaryPreferences (cuisinePreferences stays [])", async () => {
    const trip = await mkTrip({ cuisinePreferences: [], dietaryPreferences: ["Vegetarian"] });
    const r = await tripHandler({ tripId: String(trip._id), userId, action: "get" });
    expect(r.success).toBe(true);
    expect(r.data.dietaryPreferences).toEqual(["Vegetarian"]);
    expect(r.data.cuisinePreferences).toEqual([]);
    expect(r.data.cuisinePreferences).not.toContain("Italian");
  });

  it("returns [] (not undefined) when neither trip nor profile has any prefs", async () => {
    const bId = nanoid(10);
    await UserModel.create({
      _id: bId,
      email: "bare_" + bId + "@example.com",
      password: "hashed",
      firstName: "Bare",
      lastName: "User",
      provider: "local",
      isVerified: true,
    });
    const trip = await TripModel.create({
      userId: bId,
      destination: "Goa",
      origin: "Mumbai",
      startDate: new Date("2026-12-01"),
      endDate: new Date("2026-12-05"),
      budget: 6000,
      currency: "INR",
      days: 4,
      groupSize: 2,
      travelStyle: "relaxed",
      status: "planning",
      itinerary: [],
    });
    const r = await tripHandler({ tripId: String(trip._id), userId: bId, action: "get" });
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data.cuisinePreferences)).toBe(true);
    expect(Array.isArray(r.data.dietaryPreferences)).toBe(true);
    expect(r.data.cuisinePreferences).toEqual([]);
    expect(r.data.dietaryPreferences).toEqual([]);
  });
});
