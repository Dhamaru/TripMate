import { AtlasConversationModel } from "@shared/schema";
import type { Message, ToolCall } from "./types";

export class AtlasMemoryService {
  /**
   * Retrieves conversation history for a specific trip and user.
   * If no conversation exists, returns an empty array.
   */
  static async getHistory(tripId: string, userId: string): Promise<Message[]> {
    try {
      const conversation = await AtlasConversationModel.findOne({ tripId, userId }).lean().exec();
      if (!conversation) return [];

      // Map DB messages to Agent Message format
      return (conversation.messages || []).map((msg) => ({
        role: msg.role as "user" | "assistant" | "tool" | "system",
        content: msg.content || null,
        // shared/schema.ts types this as unknown[] (deliberately
        // loose, Schema.Types.Mixed under the hood) — the runtime
        // shape has always been ToolCall[], same as when this read
        // from the old server/models/AtlasConversation.ts (typed
        // any[] there, so this cast changes nothing at runtime).
        tool_calls: msg.tool_calls as ToolCall[] | undefined,
        tool_call_id: msg.tool_call_id,
        name: msg.name,
        timestamp: (msg as any).timestamp
          ? new Date((msg as any).timestamp).toISOString()
          : undefined,
      }));
    } catch (error) {
      console.error("[Atlas:Memory] Failed to get history:", error);
      return [];
    }
  }

  /**
   * Adds new messages to the conversation history.
   * Creates the conversation document if it doesn't exist.
   */
  static async addMessages(
    tripId: string,
    userId: string,
    newMessages: Message[],
    metadata?: {
      totalToolCalls?: number;
      toolsUsed?: string[];
      lastConfidence?: number;
    },
  ): Promise<void> {
    try {
      const update: any = {
        $push: {
          messages: {
            $each: newMessages.map((msg) => ({
              ...msg,
              timestamp: new Date(),
            })),
            // Rolling window — this array previously grew forever. A
            // long-running Atlas conversation on one trip would eventually
            // hit Mongo's 16MB document cap, at which point every future
            // addMessages call throws and that user+trip's Atlas session is
            // permanently broken with no recovery path. 200 messages covers
            // real multi-day conversations while keeping the document
            // safely bounded; agentLoop.ts's own in-memory summarization
            // already compresses older turns for the model's own context,
            // this just bounds what gets persisted.
            $slice: -200,
          },
        },
      };

      if (metadata) {
        if (metadata.totalToolCalls !== undefined) {
          update.$inc = { "metadata.totalToolCalls": metadata.totalToolCalls };
        }
        if (metadata.toolsUsed && metadata.toolsUsed.length > 0) {
          update.$addToSet = { "metadata.toolsUsed": { $each: metadata.toolsUsed } };
        }
        if (metadata.lastConfidence !== undefined) {
          update.$set = {
            "metadata.lastConfidence": metadata.lastConfidence,
            updatedAt: new Date(),
          };
        }
      }

      await AtlasConversationModel.findOneAndUpdate({ tripId, userId }, update, {
        upsert: true,
        new: true,
      }).exec();
    } catch (error) {
      console.error("[Atlas:Memory] Failed to add messages:", error);
    }
  }

  /**
   * Clears conversation history for a specific trip.
   */
  static async clearHistory(tripId: string, userId: string): Promise<boolean> {
    try {
      const result = await AtlasConversationModel.deleteOne({ tripId, userId }).exec();
      return result.deletedCount > 0;
    } catch (error) {
      console.error("[Atlas:Memory] Failed to clear history:", error);
      return false;
    }
  }
}
