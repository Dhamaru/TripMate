/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser, createTrip } from "../helpers/factories";
import { TripModel } from "@shared/schema";

describe("collaborators and expenses", () => {
  let owner: any, friend: any, friendUser: any, tripId: string;
  beforeAll(async () => {
    await connectDB();
    owner = (await request(app).post("/api/v1/auth/signup").send(createUser())).body;
    friendUser = createUser();
    friend = (await request(app).post("/api/v1/auth/signup").send(friendUser)).body;
    tripId = (
      await request(app)
        .post("/api/v1/trips")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ ...createTrip(owner.user.id), currency: "EUR" })
    ).body.id;
    await request(app)
      .post(`/api/v1/trips/${tripId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: friendUser.email, role: "editor" });
  });
  afterAll(async () => await closeDB());

  it("an expense without a usable currency gets the trip's", async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/expenses`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ amount: 10, currency: "rupees", category: "Food", description: "Lunch" });
    expect(res.status).toBeLessThan(300);
    const stored: any = await TripModel.findById(tripId).lean();
    expect(stored.expenses.at(-1).currency).toBe("EUR");
  });

  it("a collaborator can leave, but can't remove anyone else", async () => {
    const other = await request(app)
      .delete(`/api/v1/trips/${tripId}/collaborators/${owner.user.id}`)
      .set("Authorization", `Bearer ${friend.token}`);
    expect(other.status).toBe(404);
    const leave = await request(app)
      .delete(`/api/v1/trips/${tripId}/collaborators/${friend.user.id}`)
      .set("Authorization", `Bearer ${friend.token}`);
    expect(leave.status).toBe(200);
    const stored: any = await TripModel.findById(tripId).lean();
    expect(stored.collaborators).toHaveLength(0);
  });
});
