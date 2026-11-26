// Packing List Handler — lets Atlas add/remove/toggle items on a trip's
// packing list instead of only ever generating a fresh suggestion list.

import type { ToolResult } from "../../types";
import { PackingListModel, TripModel } from "@shared/schema";
import { socketService } from "../../../services/SocketService";

export async function packingListToolHandler(args: {
  userId: string;
  tripId?: string;
  action: "add_item" | "remove_item" | "toggle_packed" | "list";
  itemName?: string;
  itemId?: string;
  quantity?: number;
}): Promise<ToolResult> {
  const start = Date.now();
  try {
    const userId = (args.userId || "").trim();
    if (!userId) {
      return { success: false, error: "userId is required", durationMs: Date.now() - start };
    }

    // A trip-scoped packing list belongs to the trip, not the caller —
    // any owner or editor collaborator must be able to reach it, same
    // as the REST controllers (updatePackingItem/togglePackingItem
    // check ownership OR editor-collaborator before falling through).
    // The old `{ userId, tripId? }` query only ever matched the list's
    // OWNER's userId, so a collaborator's every add/remove/toggle call
    // silently 404'd with "No packing list found."
    let listOwnerId = userId;
    if (args.tripId) {
      const trip = await TripModel.findOne({
        _id: args.tripId,
        $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
      });
      if (!trip) {
        return {
          success: false,
          error: "Trip not found or access denied",
          durationMs: Date.now() - start,
        };
      }
      listOwnerId = String(trip.userId);
    }

    const query: Record<string, unknown> = args.tripId ? { tripId: args.tripId } : { userId };

    let list = await PackingListModel.findOne(query).sort({ createdAt: -1 });
    if (!list) {
      if (args.action !== "add_item") {
        return {
          success: false,
          error: "No packing list found for this trip yet.",
          durationMs: Date.now() - start,
        };
      }
      list = new PackingListModel({
        userId: listOwnerId,
        tripId: args.tripId,
        name: "Packing List",
        items: [],
      });
    }

    if (args.action === "list") {
      return { success: true, data: { items: list.items }, durationMs: Date.now() - start };
    }

    if (args.action === "add_item") {
      if (!args.itemName) {
        return {
          success: false,
          error: "itemName is required to add an item",
          durationMs: Date.now() - start,
        };
      }
      list.items.push({
        name: args.itemName,
        quantity: args.quantity && args.quantity > 0 ? args.quantity : 1,
        packed: false,
      } as any);
      await list.save();
      if (list.tripId) {
        // No excludeUserId — see modifyItineraryHandler.ts's comment on
        // the same pattern.
        socketService.broadcastMutation(String(list.tripId), {
          type: "packing-updated",
          data: list,
        });
      }
      return {
        success: true,
        data: { message: `Added "${args.itemName}" to your packing list.`, items: list.items },
        durationMs: Date.now() - start,
      };
    }

    const idx = args.itemId
      ? list.items.findIndex((it: any) => String(it._id || it.id) === args.itemId)
      : list.items.findIndex(
          (it: any) => it.name?.toLowerCase() === (args.itemName || "").toLowerCase(),
        );

    if (idx === -1) {
      return {
        success: false,
        error: `Item "${args.itemName || args.itemId}" not found on the packing list.`,
        durationMs: Date.now() - start,
      };
    }

    if (args.action === "toggle_packed") {
      (list.items[idx] as any).packed = !(list.items[idx] as any).packed;
      await list.save();
      if (list.tripId) {
        // No excludeUserId — see modifyItineraryHandler.ts's comment on
        // the same pattern.
        socketService.broadcastMutation(String(list.tripId), {
          type: "packing-updated",
          data: list,
        });
      }
      return {
        success: true,
        data: {
          message: `Marked "${list.items[idx].name}" as ${(list.items[idx] as any).packed ? "packed" : "not packed"}.`,
        },
        durationMs: Date.now() - start,
      };
    }

    if (args.action === "remove_item") {
      const removed = list.items[idx].name;
      list.items.splice(idx, 1);
      await list.save();
      if (list.tripId) {
        // No excludeUserId — see modifyItineraryHandler.ts's comment on
        // the same pattern.
        socketService.broadcastMutation(String(list.tripId), {
          type: "packing-updated",
          data: list,
        });
      }
      return {
        success: true,
        data: { message: `Removed "${removed}" from your packing list.` },
        durationMs: Date.now() - start,
      };
    }

    return {
      success: false,
      error: `Unknown action: ${args.action}`,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Packing list operation failed",
      durationMs: Date.now() - start,
    };
  }
}
