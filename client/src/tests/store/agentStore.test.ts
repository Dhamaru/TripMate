// Task 11 — unit tests for agentStore Zustand store
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";

// Mock apiRequestJson -- agentStore's chat/clearConversation calls go
// through this instead of a dedicated api-client module now.
vi.mock("../../lib/queryClient", () => ({
  apiRequestJson: vi.fn(),
}));

import { useAgentStore } from "../../store/agentStore";
import { apiRequestJson } from "../../lib/queryClient";

const defaultState = {
  conversationId: null,
  messages: [],
  isLoading: false,
  error: null,
  suggestedActions: [],
  context: {},
  isChatOpen: false,
};

describe("agentStore", () => {
  beforeEach(() => {
    useAgentStore.setState(defaultState);
    vi.clearAllMocks();
  });

  it("appends user message immediately on sendMessage", async () => {
    vi.mocked(apiRequestJson).mockResolvedValueOnce({
      response: "Hello!",
      conversationId: "conv-123",
      toolsUsed: [],
    });

    await act(async () => {
      await useAgentStore.getState().sendMessage("Hello Atlas");
    });

    const { messages } = useAgentStore.getState();
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello Atlas");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Hello!");
  });

  it("sets isLoading true during sendMessage and false after", async () => {
    let loadingDuringCall = false;
    vi.mocked(apiRequestJson).mockImplementationOnce(async () => {
      loadingDuringCall = useAgentStore.getState().isLoading;
      return { response: "Hi", conversationId: "conv-123", toolsUsed: [] };
    });

    await act(async () => {
      await useAgentStore.getState().sendMessage("test");
    });

    expect(loadingDuringCall).toBe(true);
    expect(useAgentStore.getState().isLoading).toBe(false);
  });

  it("clearConversation empties messages and conversationId", () => {
    useAgentStore.setState({
      messages: [{ id: "1", role: "user", content: "hi", timestamp: "" }],
      conversationId: "conv-123",
    });
    vi.mocked(apiRequestJson).mockResolvedValueOnce(undefined);

    act(() => {
      useAgentStore.getState().clearConversation();
    });

    expect(useAgentStore.getState().messages).toHaveLength(0);
    expect(useAgentStore.getState().conversationId).toBeNull();
  });

  it("sets error on failed sendMessage and clears loading", async () => {
    vi.mocked(apiRequestJson).mockRejectedValueOnce(new Error("API down"));

    await act(async () => {
      await useAgentStore.getState().sendMessage("test");
    });

    expect(useAgentStore.getState().error).toBe("API down");
    expect(useAgentStore.getState().isLoading).toBe(false);
  });

  it("toggleChat flips isChatOpen", () => {
    expect(useAgentStore.getState().isChatOpen).toBe(false);
    act(() => useAgentStore.getState().toggleChat());
    expect(useAgentStore.getState().isChatOpen).toBe(true);
    act(() => useAgentStore.getState().toggleChat());
    expect(useAgentStore.getState().isChatOpen).toBe(false);
  });

  it("setContext updates context", () => {
    act(() =>
      useAgentStore.getState().setContext({ currentTripId: "trip-1", currentPage: "planner" }),
    );
    expect(useAgentStore.getState().context).toEqual({
      currentTripId: "trip-1",
      currentPage: "planner",
    });
  });
});
