/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { config } from "../../server/config";

// Guard: the suite must never run with real billed-API credentials.
describe("test environment", () => {
  it("has no Gemini or Google API key", () => {
    expect(config.GEMINI_API_KEY || "").toBe("");
    expect(config.GOOGLE_API_KEY || "").toBe("");
  });

  it("blocks Gemini at the network level too", async () => {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      { method: "POST" },
    );
    expect(res.status).toBe(503);
  });
});
