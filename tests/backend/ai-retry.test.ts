/** @vitest-environment node */
import { describe, it, expect, vi } from "vitest";
import { withRetries } from "../../server/services/agents/utils";
import { MultiAgentOrchestrator } from "../../server/services/MultiAgentOrchestrator";

const err = (status: number, message = "x") => Object.assign(new Error(message), { status });

// Retrying quota/credit errors can never succeed and every attempt is billed —
// this exact pattern drained the AI balance in Oct 2026.
describe("AI retry policy", () => {
  it("never retries 429 or 402", async () => {
    for (const e of [err(429, "Resource exhausted"), err(402, "prepayment credits are depleted")]) {
      const op = vi.fn().mockRejectedValue(e);
      await expect(withRetries(op, 3, 1)).rejects.toBe(e);
      expect(op).toHaveBeenCalledTimes(1);
    }
  });

  it("still retries a transient 5xx", async () => {
    const op = vi.fn().mockRejectedValueOnce(err(503)).mockResolvedValue("ok");
    await expect(withRetries(op, 3, 1)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("stops the planning loop once the caller's timeout aborts it", async () => {
    const create = vi.fn();
    const orchestrator = new MultiAgentOrchestrator({
      openai: { chat: { completions: { create } } },
      geminiHelper: vi.fn(),
    });
    const abort = new AbortController();
    abort.abort();
    await expect(
      orchestrator.executeReasoningLoop({
        goal: "g",
        constraints: { destination: "Goa" },
        signal: abort.signal,
      }),
    ).rejects.toThrow(/aborted/);
    expect(create).not.toHaveBeenCalled();
  });
});
