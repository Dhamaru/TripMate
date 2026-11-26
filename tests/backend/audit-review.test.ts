/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";
import { UserModel, SessionModel, PackingListModel, TripModel } from "@shared/schema";
import { FeedbackAttachmentModel } from "../../server/models/FeedbackAttachment";
import { isAllowedImageUpload } from "../../server/middleware/imageUpload";
import { purgeOldGuests } from "../../server/scheduler";
import { splitByCurrency } from "../../client/src/lib/expenseTotals";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("review fixes for the audit batch", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("stores no screenshots for feedback that fails validation", async () => {
    const before = await FeedbackAttachmentModel.countDocuments();
    const res = await request(app)
      .post("/api/v1/feedback")
      .field("type", "not-a-real-type")
      .attach("attachments", png, { filename: "s.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(await FeedbackAttachmentModel.countDocuments()).toBe(before);
  });

  it("refuses an SVG declared with a .png name", () => {
    expect(isAllowedImageUpload({ mimetype: "image/svg+xml", originalname: "evil.png" })).toBe(
      false,
    );
    expect(isAllowedImageUpload({ mimetype: "image/png", originalname: "ok.png" })).toBe(true);
  });

  it("keeps an old guest who still has a live session", async () => {
    const old = new Date(Date.now() - 40 * 86400000);
    await UserModel.collection.insertMany([
      { _id: "guest_active" as any, email: "a@tripmate.guest", isGuest: true, createdAt: old },
      { _id: "guest_gone" as any, email: "g@tripmate.guest", isGuest: true, createdAt: old },
    ]);
    await SessionModel.create({
      userId: "guest_active",
      sessionId: "s-active",
      tokenHash: "x",
      expiresAt: new Date(Date.now() + 86400000),
    } as any);
    await purgeOldGuests();
    expect(await UserModel.exists({ _id: "guest_active" })).toBeTruthy();
    expect(await UserModel.exists({ _id: "guest_gone" })).toBeNull();
  });

  it("toggles an older item that has no stored 'packed' field", async () => {
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    const list = await PackingListModel.create({
      userId: s.body.user.id,
      name: "Old",
      items: [{ name: "Hat" }],
    });
    const itemId = (list.items as any)[0]._id;
    await PackingListModel.collection.updateOne(
      { _id: list._id },
      { $unset: { "items.0.packed": "" } },
    );
    const res = await request(app)
      .patch(`/api/v1/packing/${list.id}/items/${itemId}/toggle`)
      .set({ Authorization: `Bearer ${s.body.token}` });
    expect(res.status).toBe(200);
    expect(res.body.packed).toBe(true);
  });

  it("accepts a reorder whose stored times aren't short strings", async () => {
    const s = await request(app).post("/api/v1/auth/signup").send(createUser());
    const auth = { Authorization: `Bearer ${s.body.token}` };
    const long = "Morning, after breakfast, roughly between nine and ten o'clock";
    const trip = await request(app)
      .post("/api/v1/trips")
      .set(auth)
      .send(
        createTrip(s.body.user.id, {
          days: 1,
          itinerary: [
            {
              day: 1,
              activities: [
                { id: "a", title: "A", time: long },
                { id: "b", title: "B" },
              ],
            },
          ],
        } as any),
      );
    const res = await request(app)
      .put(`/api/v1/trips/${trip.body.id}/itinerary/reorder`)
      .set(auth)
      .send({
        itinerary: [
          {
            dayIndex: 0,
            activities: [
              { id: "b", title: "B" },
              { id: "a", title: "A", time: long },
            ],
          },
        ],
        baseTimes: { a: long, b: null },
      });
    expect(res.status).toBe(200);
    const stored = (await TripModel.findById(trip.body.id).lean())!.itinerary![0].activities;
    expect(stored.map((a: any) => a.id)).toEqual(["b", "a"]);
  });

  it("counts '₹' and 'rupees' expenses as INR", () => {
    const r = splitByCurrency(
      [
        { amount: 100, currency: "₹" },
        { amount: 50, currency: "rupees" },
        { amount: 5, currency: "$" },
      ],
      "INR",
    );
    expect(r.inTripCurrency).toBe(150);
    expect(r.other).toEqual({ USD: 5 });
  });
});
