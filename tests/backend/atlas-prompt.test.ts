/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../server/agent/systemPrompt";

describe("Atlas system prompt", () => {
  it("forbids invented specifics after a tool failure", () => {
    const prompt = buildSystemPrompt({ userId: "u1" } as any);
    expect(prompt).toContain("Do NOT then invent or estimate specific numbers");
    expect(prompt).toContain("qualitative guidance only");
  });
});
