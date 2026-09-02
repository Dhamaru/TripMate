import { Request, Response, NextFunction } from "express";
import { runAgentLoop } from "../agent/agentLoop";
import { AtlasMemoryService } from "../agent/memory";
import { AiUtilitiesService } from "../AiUtilitiesService";
import { UnauthorizedError, NotFoundError } from "../errors";
import { config } from "../config";
import OpenAI from "openai";
import { dispatchTool } from "../agent/tools/executor";
import { consumePendingAction } from "../agent/pendingActions";

// OpenAI configuration is now handled natively within `agentLoop.ts`
const emptyOpenai = null;
const aiService = new AiUtilitiesService();

export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tripId, message, context: clientContext } = req.body;
    const userId = req.user?._id || req.user?.id;
    if (!userId) throw new UnauthorizedError();

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    const actualTripId = tripId || clientContext?.currentTripId || clientContext?.tripId;
    // See the streaming handler below for why this falls back instead of
    // dropping history entirely when no trip is open.
    const conversationKey = actualTripId || `general:${userId}`;

    // 1. Fetch conversation history
    const history = await AtlasMemoryService.getHistory(conversationKey, userId);

    // 2. Run Agent Loop
    // clientContext is client-supplied (req.body.context) — spreading it
    // after userId let a caller override the session-derived userId with
    // an arbitrary victim id, which every Atlas tool handler then trusted
    // as the acting user's identity. Strip it before spreading.
    const { userId: _clientUserId, ...safeClientContext } = clientContext ?? {};
    const result = await runAgentLoop(
      {
        message,
        userId,
        context: {
          ...safeClientContext,
          userId,
          tripId: actualTripId,
        },
        conversationHistory: history,
      },
      {
        openai: emptyOpenai,
        aiService: aiService as any,
      },
    );

    // 3. Save new messages to history
    if (result.message) {
      await AtlasMemoryService.addMessages(
        conversationKey,
        userId,
        [
          { role: "user", content: message },
          { role: "assistant", content: result.message },
        ],
        {
          totalToolCalls: result.toolsUsed.length,
          toolsUsed: result.toolsUsed,
          lastConfidence: result.confidence.score,
        },
      );
    }

    res.json({ ...result, conversationId: conversationKey });
  } catch (error) {
    next(error);
  }
};

export const stream = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tripId, message, context: clientContext } = req.query;
    const userId = req.user?._id || req.user?.id;
    if (!userId) throw new UnauthorizedError();

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Set SSE headers. X-Accel-Buffering / X-Sourcemap-esque proxy hints matter
    // here — hosted platforms commonly front the app with an nginx-style proxy
    // that buffers responses by default, which would defeat token-by-token
    // streaming entirely (the client would see nothing until the whole
    // response completes, then get it all at once).
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    req.socket.setNoDelay(true);
    res.flushHeaders();

    const tripIdStr = (tripId || req.query.currentTripId) as string;
    const messageStr = message as string;
    const currentPage = req.query.currentPage as string;

    let contextObj: any = {};
    if (clientContext) {
      try {
        contextObj = JSON.parse(clientContext as string);
      } catch (e) {
        console.warn("[Agent:Controller] Failed to parse clientContext", e);
      }
    }

    if (currentPage && !contextObj.currentPage) contextObj.currentPage = currentPage;
    if (tripIdStr && !contextObj.currentTripId) contextObj.currentTripId = tripIdStr;

    // Conversation memory needs a key regardless of whether a trip is
    // open — Atlas is very commonly used before any trip exists yet
    // ("plan a trip to Goa"), and previously that case got no history at
    // all, so every message was a cold start with zero memory of what
    // was just said. Falls back to a per-user "general" bucket, kept
    // separate from `tripIdStr` itself (which stays the real trip id or
    // undefined) since tools that operate on a specific trip must not
    // receive this synthetic key as if it were one.
    const conversationKey = tripIdStr || `general:${userId}`;

    // 1. Fetch conversation history
    const history = await AtlasMemoryService.getHistory(conversationKey, userId);

    let tokensSent = false;

    // 2. Run Agent Loop with callbacks
    // Same client-controlled-identity issue as the chat handler above —
    // contextObj comes from a client-supplied query param.
    const { userId: _clientUserId, ...safeContextObj } = contextObj ?? {};
    const result = await runAgentLoop(
      {
        message: messageStr,
        userId,
        context: {
          ...safeContextObj,
          userId,
          tripId: tripIdStr,
        },
        conversationHistory: history,
        onToken: (token) => {
          tokensSent = true;
          res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
        },
        onTool: (toolName) => {
          res.write(`data: ${JSON.stringify({ type: "tool", tool: toolName })}\n\n`);
        },
      },
      {
        openai: emptyOpenai,
        aiService: aiService as any,
      },
    );

    // 3. Save new messages to history
    if (result.message) {
      await AtlasMemoryService.addMessages(
        conversationKey,
        userId,
        [
          { role: "user", content: messageStr },
          { role: "assistant", content: result.message },
        ],
        {
          totalToolCalls: result.toolsUsed.length,
          toolsUsed: result.toolsUsed,
          lastConfidence: result.confidence.score,
        },
      );
    }

    // 4. Send final combined event
    if (!tokensSent && result.message) {
      res.write(`data: ${JSON.stringify({ type: "token", content: result.message })}\n\n`);
    }
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        conversationId: conversationKey,
        toolsUsed: result.toolsUsed,
        confidence: result.confidence,
        feasibilityScore: result.feasibilityScore,
        mutations: result.mutations,
        structuredData: result.structuredData,
        pendingConfirmation: result.pendingConfirmation,
      })}\n\n`,
    );

    res.end();
  } catch (error) {
    console.error("[Agent:Controller] Stream error:", error);
    res.write(`data: ${JSON.stringify({ type: "error", error: "Internal stream error" })}\n\n`);
    res.end();
  }
};

// `general:${userId}` is what chat/stream already fall back to (see the
// `actualTripId || \`general:${userId}\`` chain above) whenever no trip is
// open — but that URL path param can't be empty, so the client sends the
// literal string "general" and this resolves it to the exact same key.
// Keeps the `general:` format a server-only convention the client never
// has to construct itself.
function resolveConversationKey(tripId: string, userId: string): string {
  return tripId === "general" ? `general:${userId}` : tripId;
}

export const getHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!._id;
    const history = await AtlasMemoryService.getHistory(
      resolveConversationKey(tripId, userId),
      userId,
    );
    res.json(history);
  } catch (error) {
    next(error);
  }
};

export const clearHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!._id;
    const success = await AtlasMemoryService.clearHistory(
      resolveConversationKey(tripId, userId),
      userId,
    );
    res.json({ success });
  } catch (error) {
    next(error);
  }
};

// Executes a tool call Atlas previously gated behind confirmation (see
// server/agent/tools/executor.ts's CONFIRM_REQUIRED / pendingActions.ts).
// This is the ONLY path that can run those tools — the chat/stream
// handlers above never execute them directly, no matter what the model's
// tool-call arguments say. Real confirmation is this authenticated request
// itself, from whoever is looking at the confirmation button in their own
// browser, not anything the LLM can generate on its own.
export const confirmAction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) throw new UnauthorizedError();

    const { id } = req.params;
    const pending = consumePendingAction(id, userId);
    if (!pending) throw new NotFoundError("This confirmation has expired or was already used");

    const args = JSON.parse(pending.argsJson);
    const result = await dispatchTool(
      pending.toolName,
      args,
      { userId },
      {
        openai: emptyOpenai,
        aiService: aiService as any,
      },
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
};
