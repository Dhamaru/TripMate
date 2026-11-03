/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../../server/config", async (orig) => {
  const mod: any = await orig();
  return { ...mod, config: { ...mod.config, ADMIN_SECRET: "test-admin-secret" } };
});
import request from "supertest";
import { app } from "../../server/index";
import { connectDB, closeDB } from "../helpers/db";
import { FeedbackModel } from "@shared/schema";

// The hourly triage routine reads ?unreviewed=true; contact-page messages
// must not get automated fix-plan runs.
describe("feedback triage queue", () => {
  beforeAll(async () => await connectDB());
  afterAll(async () => await closeDB());

  it("leaves contact messages out of the unreviewed queue", async () => {
    const base = { type: "feedback", subject: "s", description: "d", email: "a@example.com" };
    await FeedbackModel.create([
      { ...base, category: "contact" },
      { ...base, category: "bug-ui" },
    ]);
    const res = await request(app)
      .get("/api/v1/feedback?unreviewed=true")
      .set("x-admin-secret", "test-admin-secret");
    expect(res.status).toBe(200);
    expect(res.body.map((f: any) => f.category)).toEqual(["bug-ui"]);
  });
});
