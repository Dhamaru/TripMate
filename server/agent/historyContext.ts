import type { Message } from "./types";

// Older turns get folded into a stored summary once this many unsummarized
// tokens pile up. The summary was previously recomputed from the whole history
// on every turn, one extra billed call per message that grew with the chat.
const SUMMARIZE_AT_TOKENS = 2500;
const RECENT_USER_TURNS = 2;

export interface HistorySummary {
  summary?: string;
  summaryThrough?: string;
}

const tokens = (msgs: Message[]) =>
  msgs.reduce((n, m) => n + Math.ceil((m.content?.length ?? 0) / 4), 0);

// Cut on a user message: starting anywhere else can orphan a tool result from
// the assistant call it answers, which the model API rejects.
function recentStart(history: Message[]): number {
  let seen = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user" && ++seen === RECENT_USER_TURNS) return i;
  }
  return 0;
}

export async function prepareHistory(
  history: Message[],
  prior: HistorySummary,
  summarize: (previousSummary: string | undefined, turns: Message[]) => Promise<string>,
): Promise<{ context: Message[]; updated?: Required<HistorySummary> }> {
  const start = recentStart(history);
  const recent = history.slice(start);
  const older = history.slice(0, start);
  const pending = older.filter(
    (m) => !prior.summaryThrough || !m.timestamp || m.timestamp > prior.summaryThrough,
  );
  const withSummary = (summary?: string): Message[] =>
    summary ? [{ role: "assistant", content: `[Previous conversation summary: ${summary}]` }] : [];

  if (tokens(pending) < SUMMARIZE_AT_TOKENS) {
    return { context: [...withSummary(prior.summary), ...pending, ...recent] };
  }
  try {
    const summary = await summarize(prior.summary, pending);
    const summaryThrough = older[older.length - 1].timestamp;
    return {
      context: [...withSummary(summary), ...recent],
      ...(summaryThrough ? { updated: { summary, summaryThrough } } : {}),
    };
  } catch (err) {
    // Only an optimization: degrade to the longer context, never fail the reply.
    console.warn("[Atlas:Loop] Context summarization failed, using full history:", err);
    return { context: [...withSummary(prior.summary), ...pending, ...recent] };
  }
}
