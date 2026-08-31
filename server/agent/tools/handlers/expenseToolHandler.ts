// Expense Handler — lets Atlas add or remove trip expenses. Removal is
// destructive and gated by the confirm-required check in executor.ts.

import type { ToolResult } from "../../types";
import { TripModel } from "@shared/schema";
import { nanoid } from "nanoid";
import { socketService } from "../../../services/SocketService";
import { notifyTripParticipants } from "../../../notifications";

export async function expenseToolHandler(args: {
  userId: string;
  tripId: string;
  action: "add" | "remove";
  amount?: number;
  currency?: string;
  category?: string;
  description?: string;
  expenseId?: string;
}): Promise<ToolResult> {
  const start = Date.now();
  try {
    const userId = (args.userId || "").trim();
    const tripId = (args.tripId || "").trim();
    if (!userId || !tripId) {
      return {
        success: false,
        error: "tripId and userId are required",
        durationMs: Date.now() - start,
      };
    }

    const accessFilter = {
      _id: tripId,
      $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
    };

    if (args.action === "add") {
      if (!args.amount || !args.currency || !args.category) {
        return {
          success: false,
          error: "amount, currency, and category are required to add an expense",
          durationMs: Date.now() - start,
        };
      }
      const newExpense = {
        id: nanoid(),
        amount: args.amount,
        currency: args.currency,
        category: args.category,
        description: args.description || "",
        date: new Date(),
      };
      const trip = await TripModel.findOneAndUpdate(
        accessFilter,
        { $push: { expenses: newExpense } },
        { new: true },
      );
      if (!trip) {
        return { success: false, error: "Trip not found", durationMs: Date.now() - start };
      }
      socketService.broadcastMutation(
        tripId,
        { type: "expenses-updated", data: trip.expenses },
        userId,
      );
      await notifyTripParticipants(trip, userId, {
        type: "expense-updated",
        title: "Expense added",
        message: `${newExpense.amount} ${newExpense.currency} (${newExpense.category}) added to your trip to ${trip.destination}.`,
        link: `/app/trips/${tripId}`,
        tripId,
      });
      return {
        success: true,
        data: {
          message: `Added ${args.amount} ${args.currency} expense (${args.category}).`,
          expense: newExpense,
        },
        durationMs: Date.now() - start,
      };
    }

    if (args.action === "remove") {
      if (!args.expenseId) {
        return {
          success: false,
          error: "expenseId is required to remove an expense",
          durationMs: Date.now() - start,
        };
      }
      const trip = await TripModel.findOneAndUpdate(
        { ...accessFilter, "expenses.id": args.expenseId },
        { $pull: { expenses: { id: args.expenseId } } },
        { new: true },
      );
      if (!trip) {
        const tripExists = await TripModel.exists(accessFilter);
        return {
          success: false,
          error: tripExists ? "Expense not found" : "Trip not found",
          durationMs: Date.now() - start,
        };
      }
      socketService.broadcastMutation(
        tripId,
        { type: "expenses-updated", data: trip.expenses },
        userId,
      );
      await notifyTripParticipants(trip, userId, {
        type: "expense-updated",
        title: "Expense removed",
        message: `An expense was removed from your trip to ${trip.destination}.`,
        link: `/app/trips/${tripId}`,
        tripId,
      });
      return {
        success: true,
        data: { message: "Expense removed." },
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
      error: err.message || "Expense operation failed",
      durationMs: Date.now() - start,
    };
  }
}
