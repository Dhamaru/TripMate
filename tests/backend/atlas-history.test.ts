/** @vitest-environment node */
import { describe, it, expect, vi } from "vitest";
import { prepareHistory } from "../../server/agent/historyContext";
import type { Message } from "../../server/agent/types";

const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
const turn = (i: number, size = 4000): Message[] => [
  { role: "user", content: `q${i}`, timestamp: at(i * 3) },
  {
    role: "assistant",
    content: null,
    tool_calls: [
      { id: `c${i}`, type: "function", function: { name: "get_trip", arguments: "{}" } },
    ],
    timestamp: at(i * 3),
  },
  { role: "tool", content: "t".repeat(size), tool_call_id: `c${i}`, timestamp: at(i * 3) },
  { role: "assistant", content: `a${i}`, timestamp: at(i * 3) },
];
const convo = (n: number, size?: number) =>
  Array.from({ length: n }, (_, i) => turn(i, size)).flat();

describe("Atlas conversation context", () => {
  it("makes no summary call for a short conversation", async () => {
    const summarize = vi.fn();
    const history = convo(3, 100);
    const { context } = await prepareHistory(history, {}, summarize);
    expect(summarize).not.toHaveBeenCalled();
    expect(context).toEqual(history);
  });

  it("summarizes once, then reuses the stored summary on the next turn", async () => {
    const summarize = vi.fn().mockResolvedValue("S1");
    const first = await prepareHistory(convo(6), {}, summarize);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(first.updated?.summary).toBe("S1");

    // One more turn arrives: only one newly-old turn, under the threshold.
    summarize.mockClear();
    const next = await prepareHistory(convo(7), first.updated!, summarize);
    expect(summarize).not.toHaveBeenCalled();
    expect(next.context[0].content).toContain("S1");
    expect(next.context.map((m) => m.content)).not.toContain("q0");
  });

  it("folds the previous summary and only new turns into the next summary", async () => {
    const summarize = vi.fn().mockResolvedValue("S2");
    await prepareHistory(convo(12), { summary: "S1", summaryThrough: at(5 * 3) }, summarize);
    const [previous, turns] = summarize.mock.calls[0];
    expect(previous).toBe("S1");
    expect(turns[0].content).toBe("q6");
  });

  it("never starts the kept turns on an orphaned tool result", async () => {
    const summarize = vi.fn().mockResolvedValue("S");
    const { context } = await prepareHistory(convo(6), {}, summarize);
    expect(context[1].role).toBe("user");
    const callIds = context.flatMap((m) => m.tool_calls?.map((c) => c.id) ?? []);
    for (const m of context.filter((x) => x.role === "tool"))
      expect(callIds).toContain(m.tool_call_id);
  });

  it("falls back to the full context if summarizing fails", async () => {
    const summarize = vi.fn().mockRejectedValue(new Error("429"));
    const history = convo(6);
    const { context, updated } = await prepareHistory(history, {}, summarize);
    expect(context).toEqual(history);
    expect(updated).toBeUndefined();
  });

  it("never stores an empty summary (it would drop those turns for good)", async () => {
    const history = convo(6);
    const { context, updated } = await prepareHistory(history, {}, vi.fn().mockResolvedValue("  "));
    expect(updated).toBeUndefined();
    expect(context).toEqual(history);
  });
});
