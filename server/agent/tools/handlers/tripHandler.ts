// Trip Handler — getTrip + updateItineraryDay with chronological validation

import type { ToolResult } from "../../types";
import { TripModel, UserModel } from "@shared/schema";

export async function tripHandler(args: {
  tripId: string;
  userId: string;
  action?: string;
  dayIndex?: number;
  updatedActivities?: any[];
}): Promise<ToolResult> {
  const start = Date.now();
  try {
    const tripId = (args.tripId || "").trim();
    const userId = (args.userId || "").trim();

    if (!tripId || !userId) {
      return {
        success: false,
        error: "tripId and userId are required",
        durationMs: Date.now() - start,
      };
    }

    const doc = await TripModel.findOne({ _id: tripId, userId });
    if (!doc) {
      return { success: false, error: "Trip not found", durationMs: Date.now() - start };
    }

    // Default action: just return trip details
    if (!args.action || args.action === "get") {
      // Atlas fetches this every turn ("🗺 Trip details fetched") but
      // cuisine/dietary preferences were never in the payload at all
      // — live-reported: a vegetarian profile + cuisine likes had no
      // effect on what Atlas suggested. Trip-level prefs are the
      // source of truth (set at trip creation, can diverge from the
      // profile afterward on purpose); only fall back to the
      // profile's own defaults when the trip has none set at all —
      // covers a trip created before this preference existed, or via
      // Import My Plan, which never asks for them.
      let cuisinePreferences = doc.cuisinePreferences;
      let dietaryPreferences = doc.dietaryPreferences;
      if (!cuisinePreferences?.length && !dietaryPreferences?.length) {
        const user = await UserModel.findById(userId)
          .select("cuisinePreferences dietaryPreferences")
          .lean();
        if (user) {
          cuisinePreferences = user.cuisinePreferences;
          dietaryPreferences = user.dietaryPreferences;
        }
      }

      return {
        success: true,
        data: {
          id: doc._id,
          destination: doc.destination,
          days: doc.days,
          groupSize: doc.groupSize,
          budget: doc.budget,
          currency: doc.currency || "INR",
          travelStyle: doc.travelStyle,
          transportMode: doc.transportMode,
          status: doc.status,
          startDate: doc.startDate,
          endDate: doc.endDate,
          itinerary: doc.itinerary || [],
          expenses: doc.expenses || [],
          notes: doc.notes,
          costBreakdown: doc.costBreakdown,
          cuisinePreferences: cuisinePreferences || [],
          dietaryPreferences: dietaryPreferences || [],
        },
        durationMs: Date.now() - start,
      };
    }

    // Update a single day's activities
    if (
      args.action === "update_day" &&
      typeof args.dayIndex === "number" &&
      args.updatedActivities
    ) {
      const itinerary = JSON.parse(JSON.stringify(doc.itinerary || []));
      const dayIndex = args.dayIndex;

      if (dayIndex < 0 || dayIndex >= itinerary.length) {
        return {
          success: false,
          error: `Invalid dayIndex: ${dayIndex}. Trip has ${itinerary.length} days.`,
          durationMs: Date.now() - start,
        };
      }

      // Validate chronological order of activities by time
      const activities = args.updatedActivities.map((act: any, i: number) => ({
        id: act.id || Math.random().toString(36).substring(7),
        time: act.time || `${String(8 + i).padStart(2, "0")}:00 AM`,
        title: act.title || "Activity",
        ...act,
      }));

      // Sort by time for chronological order
      activities.sort((a: any, b: any) => {
        const parseTime = (t: string): number => {
          const match = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
          if (!match) return 0;
          let h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          if (match[3]?.toUpperCase() === "PM" && h !== 12) h += 12;
          if (match[3]?.toUpperCase() === "AM" && h === 12) h = 0;
          return h * 60 + m;
        };
        return parseTime(a.time) - parseTime(b.time);
      });

      itinerary[dayIndex] = { ...itinerary[dayIndex], activities };
      doc.itinerary = itinerary;
      doc.markModified("itinerary");
      await doc.save();

      return {
        success: true,
        data: {
          message: `Day ${dayIndex + 1} updated with ${activities.length} activities (chronologically sorted)`,
          dayIndex,
          activities,
        },
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
      error: err.message || "Trip operation failed",
      durationMs: Date.now() - start,
    };
  }
}
