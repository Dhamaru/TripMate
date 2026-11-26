/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { createUser } from "../helpers/factories";

describe("change password", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("rejects an empty or too-short new password", async () => {
    const u = createUser();
    const { body } = await request(app).post("/api/v1/auth/signup").send(u);
    for (const newPassword of ["", "x"]) {
      const res = await request(app)
        .post("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${body.token}`)
        .send({ currentPassword: u.password, newPassword });
      expect(res.status, JSON.stringify(newPassword)).toBe(400);
    }
  });

  it("signs out the account's other sessions", async () => {
    const u = createUser();
    const a = await request(app).post("/api/v1/auth/signup").send(u);
    const b = await request(app)
      .post("/api/v1/auth/signin")
      .send({ email: u.email, password: u.password });
    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${a.body.token}`)
      .send({ currentPassword: u.password, newPassword: "BrandNew!234" });
    expect(res.status).toBe(200);
    const other = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${b.body.token}`);
    expect(other.status).toBe(401);
  });
});
