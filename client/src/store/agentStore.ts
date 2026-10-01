import { create } from "zustand";
import type {
  AgentMessage,
  SuggestedAction,
  AgentStructuredData,
  AgentResponse,
  AgentChatRequest,
  PendingConfirmation,
} from "../types/api.types";
import { apiRequestJson } from "../lib/queryClient";
import { nanoid } from "nanoid";

interface StreamDonePayload {
  conversationId: string;
  toolsUsed: string[];
  structuredData?: unknown;
  pendingConfirmation?: PendingConfirmation;
}

interface SSEMessage {
  type: "token" | "tool" | "done" | "error";
  content?: string;
  tool?: string;
  conversationId?: string;
  toolsUsed?: string[];
  structuredData?: unknown;
  pendingConfirmation?: PendingConfirmation;
  error?: string;
}

// Raw EventSource plumbing for streamMessage below -- not axios-based, so
// this doesn't shrink by switching off axios; it's its own thing because
// SSE isn't a fetch/JSON call like the rest of this store's requests.
function streamAgentChat(
  data: AgentChatRequest,
  onToken: (token: string) => void,
  onTool: (tool: string) => void,
  onDone: (meta: StreamDonePayload) => void,
  onError: (error: string) => void,
): () => void {
  const params = new URLSearchParams({
    message: data.message,
    ...(data.conversationId && { conversationId: data.conversationId }),
    ...(data.context?.currentTripId && { currentTripId: data.context.currentTripId }),
    ...(data.context?.currentPage && { currentPage: data.context.currentPage }),
  });
  const url = `/api/v1/agent/chat/stream?${params.toString()}`;
  const es = new EventSource(url, { withCredentials: true });

  // A stalled connection (accepted but never sends a byte) doesn't trigger
  // EventSource's onerror — that only fires on a hard close. Without a
  // watchdog, a hung backend request leaves the UI's isLoading stuck true
  // forever. Reset this on every event received; fire once if the gap
  // since the last event (or connection open) exceeds STALL_TIMEOUT_MS.
  // Must comfortably exceed the server's per-model timeout (25s) plus room
  // for a fallback attempt, or this fires before the backend's own
  // model-fallback chain gets a chance.
  const STALL_TIMEOUT_MS = 45_000;
  let stallTimer: ReturnType<typeof setTimeout>;
  let settled = false;
  const resetStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onError("Response timed out");
      es.close();
    }, STALL_TIMEOUT_MS);
  };
  resetStallTimer();

  es.onmessage = (e: MessageEvent<string>) => {
    resetStallTimer();
    const parsed = JSON.parse(e.data) as SSEMessage;
    if (parsed.type === "token" && parsed.content) onToken(parsed.content);
    if (parsed.type === "tool" && parsed.tool) onTool(parsed.tool);
    if (parsed.type === "done") {
      settled = true;
      clearTimeout(stallTimer);
      onDone({
        conversationId: parsed.conversationId ?? "",
        toolsUsed: parsed.toolsUsed ?? [],
        structuredData: parsed.structuredData,
        pendingConfirmation: parsed.pendingConfirmation,
      });
      es.close();
    }
    if (parsed.type === "error") {
      settled = true;
      clearTimeout(stallTimer);
      onError(parsed.error ?? "Stream error");
      es.close();
    }
  };
  es.onerror = () => {
    if (settled) return;
    settled = true;
    clearTimeout(stallTimer);
    onError("Connection lost");
    es.close();
  };
  return () => {
    clearTimeout(stallTimer);
    es.close();
  };
}

interface AgentContext {
  currentTripId?: string;
  currentPage?: string;
}

interface AgentStore {
  conversationId: string | null;
  messages: AgentMessage[];
  isLoading: boolean;
  error: string | null;
  suggestedActions: SuggestedAction[];
  context: AgentContext;
  isChatOpen: boolean;
  // Closes the in-flight EventSource + clears its stall timer. agentApi.stream()
  // returns this on every call, but until now nothing captured or invoked
  // it — closing the panel mid-response left the connection and its ~45s
  // watchdog timer running invisibly in the background instead of tearing
  // down with the UI that was displaying it.
  activeStreamCleanup: (() => void) | null;
  // True while a hydration fetch is in flight — lets the panel show a
  // loading state instead of flashing "no messages yet" for a beat while
  // switching trips or on first mount.
  isHistoryLoading: boolean;
  toggleChat: () => void;
  setContext: (context: AgentContext) => void;
  loadConversation: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  streamMessage: (text: string) => Promise<void>;
  clearConversation: () => void;
  handleStructuredData: (data: AgentStructuredData) => void;
  confirmPendingAction: (messageId: string, pendingActionId: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  conversationId: null,
  messages: [],
  isLoading: false,
  error: null,
  suggestedActions: [],
  context: {},
  isChatOpen: false,

  activeStreamCleanup: null,
  isHistoryLoading: false,
  toggleChat: () =>
    set((state) => {
      const closing = state.isChatOpen;
      const hadActiveStream = closing && !!state.activeStreamCleanup;
      if (hadActiveStream) {
        state.activeStreamCleanup!();
      }
      return {
        isChatOpen: !state.isChatOpen,
        activeStreamCleanup: closing ? null : state.activeStreamCleanup,
        // es.close() is a client-initiated close — per the EventSource
        // spec it does NOT fire onerror, so neither onDone nor onError
        // ever ran to reset these. Without this, closing mid-response
        // left isLoading/isStreaming stuck true forever: the input
        // stayed disabled and the streaming bubble stayed frozen with
        // its cursor, even after reopening the panel — required a full
        // page reload to recover.
        ...(hadActiveStream
          ? {
              isLoading: false,
              messages: state.messages.map((m) =>
                m.isStreaming ? { ...m, isStreaming: false } : m,
              ),
            }
          : {}),
      };
    }),

  setContext: (context) => set((state) => ({ context: { ...state.context, ...context } })),

  // Was never called anywhere — the server has always durably persisted
  // and re-fed conversation history into the model on every request
  // (AtlasMemoryService, keyed per trip), but the UI itself started every
  // page load with an empty `messages: []` and no way to get it back
  // short of asking Atlas something and having it answer as if it
  // remembered, with nothing to show for the history above the fold.
  // "general" is the literal route sentinel the server resolves to its
  // internal general:${userId} key — see agent.controller.ts.
  loadConversation: async () => {
    const key = get().context.currentTripId || "general";
    // A send fired from another screen (e.g. the trip page's "Smart packing
    // list" button, which navigates away immediately) races this hydration:
    // the optimistic user message is already on screen but the server hasn't
    // persisted the turn yet, so a fetch here would return the OLD history
    // and wipe it. Skip while a send for this same conversation is in flight.
    if (get().isLoading && key === get().conversationId) return;
    set({ isHistoryLoading: true });
    try {
      const history: any = await apiRequestJson("GET", `/api/v1/agent/history/${key}`);
      const fetched: AgentMessage[] = (Array.isArray(history) ? history : [])
        // tool/system turns are the model's own internal reasoning steps,
        // never meant to render as chat bubbles — same filter the live
        // send/stream paths implicitly apply by only ever constructing
        // user/assistant AgentMessages in the first place.
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({
          id: nanoid(),
          role: m.role,
          content: m.content || "",
          timestamp: m.timestamp || new Date().toISOString(),
        }));
      // Don't let a stale/slower fetch shrink a conversation we're already
      // showing more of (same race as above, just landing a beat later).
      const cur = get();
      if (key === cur.conversationId && fetched.length < cur.messages.length) {
        set({ isHistoryLoading: false });
        return;
      }
      set({ messages: fetched, conversationId: key, isHistoryLoading: false });
    } catch {
      // A failed hydration shouldn't wipe out whatever's already on
      // screen (e.g. messages from earlier this session) — just stop
      // the loading state and leave things as they are.
      set({ isHistoryLoading: false });
    }
  },

  sendMessage: async (text) => {
    const userMsg: AgentMessage = {
      id: nanoid(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, userMsg],
      isLoading: true,
      error: null,
      suggestedActions: [],
    }));
    try {
      const result = await apiRequestJson<AgentResponse>("POST", "/api/v1/agent/chat", {
        message: text,
        conversationId: get().conversationId ?? undefined,
        context: get().context,
      });
      const assistantMsg: AgentMessage = {
        id: nanoid(),
        role: "assistant",
        content:
          result.message ||
          result.response ||
          "I'm here to help, but I couldn't form a response. Please try again.",
        toolsUsed: result.toolsUsed,
        timestamp: new Date().toISOString(),
        pendingConfirmation: result.pendingConfirmation,
      };
      set((state) => ({
        messages: [...state.messages, assistantMsg],
        conversationId: result.conversationId,
        suggestedActions: result.suggestedActions ?? [],
        isLoading: false,
      }));
      if (result.structuredData) get().handleStructuredData(result.structuredData as any);
    } catch (e: any) {
      const msg = e?.message || e?.error || String(e) || "Network error";
      const errorMsg: AgentMessage = {
        id: nanoid(),
        role: "assistant",
        content: `⚠️ Sorry, I encountered an error: ${msg}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        error: msg,
        isLoading: false,
      }));
    }
  },

  streamMessage: async (text) => {
    const userMsg: AgentMessage = {
      id: nanoid(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const streamingId = nanoid();
    const streamingMsg: AgentMessage = {
      id: streamingId,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };
    set((state) => ({
      messages: [...state.messages, userMsg, streamingMsg],
      isLoading: true,
      error: null,
      suggestedActions: [],
    }));

    return new Promise<void>((resolve) => {
      const cleanup = streamAgentChat(
        {
          message: text,
          conversationId: get().conversationId ?? undefined,
          context: get().context,
        },
        (token) => {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === streamingId ? { ...m, content: m.content + token } : m,
            ),
          }));
        },
        (tool) => {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === streamingId
                ? // Server fires onTool per invocation, not per
                  // unique tool — a turn that calls the same
                  // tool twice (e.g. two search_places calls)
                  // showed two identical badges mid-stream. The
                  // final `done` event already sends a
                  // deduplicated toolsUsed array, but only after
                  // streaming finishes, so this flickered
                  // visibly for multi-tool-call turns until then.
                  {
                    ...m,
                    toolsUsed: (m.toolsUsed ?? []).includes(tool)
                      ? m.toolsUsed
                      : [...(m.toolsUsed ?? []), tool],
                  }
                : m,
            ),
          }));
        },
        (meta) => {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === streamingId
                ? {
                    ...m,
                    isStreaming: false,
                    toolsUsed: meta.toolsUsed,
                    pendingConfirmation: meta.pendingConfirmation,
                  }
                : m,
            ),
            conversationId: meta.conversationId,
            isLoading: false,
            activeStreamCleanup: null,
          }));
          if (meta.structuredData) {
            get().handleStructuredData(meta.structuredData as AgentStructuredData);
          }
          resolve();
        },
        (error) => {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === streamingId ? { ...m, content: `Error: ${error}`, isStreaming: false } : m,
            ),
            isLoading: false,
            error,
            activeStreamCleanup: null,
          }));
          resolve();
        },
      );
      set({ activeStreamCleanup: cleanup });
    });
  },

  clearConversation: () => {
    const { conversationId } = get();
    if (conversationId) {
      apiRequestJson("DELETE", `/api/v1/agent/history/${conversationId}`).catch(() => {});
    }
    set({ messages: [], conversationId: null, suggestedActions: [] });
  },

  handleStructuredData: (_data: AgentStructuredData) => {
    // Genuinely a no-op, and that's fine: live UI refresh after an Atlas
    // tool call happens via the socket "trip-mutation" broadcast every
    // tool handler fires after a real DB write (see TripDetail.tsx's
    // socket listener), not through this field. structuredData is a
    // presentation hint for rendering structured content inline in the
    // chat bubble itself, which isn't implemented yet — investigated
    // and confirmed this isn't silently breaking live-refresh (that
    // was a real gap, just in packingListToolHandler.ts's missing
    // broadcastMutation call, fixed separately).
  },

  // The only place a gated tool (manage_expense remove, manage_collaborator)
  // actually runs — triggered by a real button click here, not anything
  // the model said. See server/agent/pendingActions.ts for why this can't
  // just be "confirmed: true" in the chat message.
  confirmPendingAction: async (messageId, pendingActionId) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, pendingConfirmation: undefined } : m,
      ),
    }));
    try {
      const result: any = await apiRequestJson(
        "POST",
        `/api/v1/agent/confirm-action/${pendingActionId}`,
      );
      const note = result?.success
        ? `\n\n✅ ${result?.data?.message || "Done."}`
        : `\n\n⚠️ ${result?.error || "Could not complete this action."}`;
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, content: m.content + note } : m,
        ),
      }));
    } catch (e: any) {
      const msg = e?.message || "Could not complete this action.";
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, content: m.content + `\n\n⚠️ ${msg}` } : m,
        ),
      }));
    }
  },
}));
