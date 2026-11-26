/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";
import { TripModel, PackingListModel, JournalEntryModel } from "@shared/schema";
import { runReminderSweep } from "../../server/scheduler";
import { splitByCurrency } from "../../client/src/lib/expenseTotals";

async function account() {
  const u = createUser();
  const s = await request(app).post("/api/v1/auth/signup").send(u);
  return {
    id: s.body.user.id as string,
    email: u.email,
    auth: { Authorization: `Bearer ${s.body.token}` },
  };
}

describe("audit fixes: itinerary", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("refuses a reorder that would put back a time a collaborator just changed", async () => {
    const a = await account();
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(a.auth)
      .send(
        createTrip(a.id, {
          days: 1,
          itinerary: [
            {
              day: 1,
              activities: [
                { id: "x", title: "Fort", time: "09:00 AM" },
                { id: "y", title: "Palace", time: "11:00 AM" },
              ],
            },
          ],
        } as any),
      );
    const id = trip.body.id;
    // Someone else moves the palace to 3 PM.
    await TripModel.updateOne(
      { _id: id },
      { $set: { "itinerary.0.activities.1.time": "03:00 PM" } },
    );
    const res = await request(app)
      .put(`/api/v1/trips/${id}/itinerary/reorder`)
      .set(a.auth)
      .send({
        itinerary: [
          {
            dayIndex: 0,
            activities: [
              { id: "y", title: "Palace", time: "09:00 AM" },
              { id: "x", title: "Fort", time: "11:00 AM" },
            ],
          },
        ],
        baseTimes: { x: "09:00 AM", y: "11:00 AM" },
      });
    expect(res.status).toBe(409);
  });

  it("adds the first activity to a trip saved without an itinerary, but not past its last day", async () => {
    const a = await account();
    const t = await TripModel.create({ ...createTrip(a.id, { days: 2 } as any), userId: a.id });
    await TripModel.updateOne({ _id: t._id }, { $unset: { itinerary: 1 } });
    const ok = await request(app)
      .post(`/api/v1/trips/${t.id}/itinerary/activity`)
      .set(a.auth)
      .send({ dayIndex: 0, activity: { title: "Lunch", time: "01:00 PM" } });
    expect(ok.status).toBe(201);
    const far = await request(app)
      .post(`/api/v1/trips/${t.id}/itinerary/activity`)
      .set(a.auth)
      .send({ dayIndex: 40, activity: { title: "Nope" } });
    expect(far.status).toBe(400);
    expect((await TripModel.findById(t.id).lean())!.itinerary!.length).toBe(1);
  });
});

describe("audit fixes: packing lists", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("shares a trip's list with collaborators and lets the trip owner edit theirs", async () => {
    const owner = await account();
    const editor = await account();
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(owner.auth)
      .send(createTrip(owner.id));
    await request(app)
      .post(`/api/v1/trips/${trip.body.id}/collaborators`)
      .set(owner.auth)
      .send({ email: editor.email, role: "editor" });
    // The editor creates the trip's list.
    const created = await request(app)
      .post("/api/v1/packing")
      .set(editor.auth)
      .send({ tripId: trip.body.id, name: "Gear", items: [{ name: "Torch", quantity: 1 }] });
    expect(created.status).toBe(201);
    // The owner sees it on the packing page (no tripId filter) and can save it.
    const lists = await request(app).get("/api/v1/packing-lists").set(owner.auth);
    const list = lists.body.find((l: any) => l.name === "Gear");
    expect(list).toBeTruthy();
    const saved = await request(app)
      .put(`/api/v1/packing-lists/${list.id}`)
      .set(owner.auth)
      .send({ items: [{ name: "Torch", quantity: 2 }], baseUpdatedAt: list.updatedAt });
    expect(saved.status).toBe(200);
    // A save based on the old version is refused instead of erasing that one.
    const stale = await request(app)
      .put(`/api/v1/packing-lists/${list.id}`)
      .set(editor.auth)
      .send({ items: [{ name: "Torch", quantity: 9 }], baseUpdatedAt: list.updatedAt });
    expect(stale.status).toBe(409);
  });

  it("toggles an item by id even after another item was removed", async () => {
    const a = await account();
    const list = await PackingListModel.create({
      userId: a.id,
      name: "Bag",
      items: [{ name: "A" }, { name: "B" }, { name: "C" }],
    });
    const cId = String((list.items as any)[2]._id);
    await PackingListModel.updateOne({ _id: list._id }, { $pull: { items: { name: "A" } } });
    const res = await request(app)
      .patch(`/api/v1/packing/${list.id}/items/${cId}/toggle`)
      .set(a.auth);
    expect(res.status).toBe(200);
    const after = (await PackingListModel.findById(list.id).lean())!.items as any[];
    expect(after.map((i) => [i.name, !!i.packed])).toEqual([
      ["B", false],
      ["C", true],
    ]);
  });
});

describe("audit fixes: trips and collaborators", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("restarts reminders when the start date moves", async () => {
    const a = await account();
    const soon = new Date(Date.now() + 7 * 86400000);
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(a.auth)
      .send(createTrip(a.id, { startDate: soon, endDate: soon } as any));
    await TripModel.updateOne({ _id: trip.body.id }, { $set: { remindersSent: ["t-7"] } });
    const later = new Date(Date.now() + 40 * 86400000).toISOString();
    const res = await request(app)
      .put(`/api/v1/trips/${trip.body.id}`)
      .set(a.auth)
      .send({ startDate: later });
    expect(res.status).toBe(200);
    expect((await TripModel.findById(trip.body.id).lean())!.remindersSent).toEqual([]);
  });

  it("sends each reminder once even when two sweeps overlap", async () => {
    const a = await account();
    const inSeven = new Date();
    inSeven.setDate(inSeven.getDate() + 7);
    inSeven.setHours(12, 0, 0, 0);
    const t = await TripModel.create({
      ...createTrip(a.id, { startDate: inSeven, endDate: inSeven } as any),
      userId: a.id,
    });
    await Promise.all([runReminderSweep(), runReminderSweep()]);
    const sent = (await TripModel.findById(t.id).lean())!.remindersSent || [];
    expect(new Set(sent).size).toBe(sent.length);
  });

  it("deleting a trip removes its lists and detaches collaborators' journal entries", async () => {
    const owner = await account();
    const other = await account();
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(owner.auth)
      .send(createTrip(owner.id));
    const tid = trip.body.id;
    await PackingListModel.create({ userId: other.id, tripId: tid, name: "Theirs", items: [] });
    const entry = await JournalEntryModel.create({
      userId: other.id,
      tripId: tid,
      title: "Memories",
      content: "Kept",
    });
    expect((await request(app).delete(`/api/v1/trips/${tid}`).set(owner.auth)).status).toBe(204);
    expect(await PackingListModel.countDocuments({ tripId: tid })).toBe(0);
    const kept = await JournalEntryModel.findById(entry.id).lean();
    expect(kept).toBeTruthy();
    expect(kept!.tripId).toBeUndefined();
  });

  it("won't 'remove' someone who isn't on the trip", async () => {
    const owner = await account();
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(owner.auth)
      .send(createTrip(owner.id));
    const res = await request(app)
      .delete(`/api/v1/trips/${trip.body.id}/collaborators/some-random-user`)
      .set(owner.auth);
    expect(res.status).toBe(404);
  });
});

describe("expense totals", () => {
  it("keeps other currencies out of the trip-currency total", () => {
    const r = splitByCurrency(
      [{ amount: 500, currency: "INR" }, { amount: 20, currency: "USD" }, { amount: 100 }],
      "INR",
    );
    expect(r.inTripCurrency).toBe(600);
    expect(r.other).toEqual({ USD: 20 });
  });
});
