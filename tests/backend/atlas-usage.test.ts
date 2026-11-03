/** @vitest-environment node */
import { describe, it, expect, vi } from "vitest";

// Gemini's OpenAI-compatible stream repeats the running usage total on
// several chunks. Summing them inflated Atlas's token count several times
// over (and tripped its token budget early).
vi.mock("openai", () => {
  class OpenAI {
    chat = {
      completions: {
        create: async () =>
          (async function* () {
            yield { choices: [{ delta: { content: "Hello " } }], usage: { total_tokens: 1200 } };
            yield { choices: [{ delta: { content: "there" } }], usage: { total_tokens: 1200 } };
            yield {
              choices: [{ delta: {}, finish_reason: "stop" }],
              usage: { total_tokens: 1200 },
            };
          })(),
      },
    };
  }
  return { default: OpenAI };
});
vi.mock("../../server/config", async (orig) => {
  const mod: any = await orig();
  return { ...mod, config: { ...mod.config, GEMINI_API_KEY: "test-key" } };
});

describe("Atlas token accounting", () => {
  it("counts each model call's usage once", async () => {
    const { runAgentLoop } = await import("../../server/agent/agentLoop");
    const res = await runAgentLoop(
      { message: "hi", userId: "u1", context: { userId: "u1" } as any },
      { aiService: {} as any } as any,
    );
    expect(res.message).toContain("Hello there");
    expect(res.tokensUsed).toBe(1200);
  });
});
