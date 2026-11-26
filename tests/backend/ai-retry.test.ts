/** @vitest-environment node */
import { describe, it, expect, vi } from "vitest";
import { withRetries } from "../../server/services/agents/utils";
import { MultiAgentOrchestrator } from "../../server/services/MultiAgentOrchestrator";
import { DraftingAgent } from "../../server/services/agents/DraftingAgent";

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

  it("doesn't fall back to a second model on a quota error (same key)", async () => {
    const create = vi.fn();
    const drafter = new DraftingAgent({
      openai: { chat: { completions: { create } } },
      geminiHelper: vi.fn().mockRejectedValue(err(429, "Resource exhausted")),
    });
    await expect(drafter.generateDraft("g", {}, { destination: "Goa", days: 2 })).rejects.toThrow(
      /exhausted/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("makes no more AI calls once a timeout fires mid-iteration", async () => {
    const orchestrator: any = new MultiAgentOrchestrator({ openai: {}, geminiHelper: vi.fn() });
    const abort = new AbortController();
    orchestrator.researchAgent.gatherContext = vi.fn().mockResolvedValue({});
    orchestrator.draftingAgent.generateDraft = vi.fn(async () => {
      abort.abort(); // the caller's 90s timeout fires while drafting
      return { rawDraft: {}, source: "gemini" };
    });
    const critique = (orchestrator.criticAgent.critiqueDraft = vi.fn());
    const format = (orchestrator.formattingAgent.formatFinalPayload = vi.fn());
    await expect(
      orchestrator.executeReasoningLoop({
        goal: "g",
        constraints: { destination: "Goa" },
        signal: abort.signal,
      }),
    ).rejects.toThrow(/aborted/);
    expect(critique).not.toHaveBeenCalled();
    expect(format).not.toHaveBeenCalled();
  });
});
