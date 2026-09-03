// Modify Itinerary Handler — Surgical edits to trip itinerary
// Supports: replace_day, add_activity, remove_activity, swap_activities

import type { ToolResult } from "../../types";
import { TripModel } from "@shared/schema";
import { nanoid } from "nanoid";
import { FeasibilityModeler } from "../../../services/FeasibilityModeler";
import { socketService } from "../../../services/SocketService";

// Atlas's own tool-call arguments sometimes come back shouting-case
// ("SRI RUDRA BIRYANI PALACE") or with stray trailing punctuation ("The
// Brewery."), live-reported. Only intervenes on a title with ZERO
// lowercase letters (i.e. actually all-caps, not just capitalized words)
// and at least 2 words, so a short real acronym ("KFC") isn't mangled
// into "Kfc" — the reported bug was always a multi-word phrase.
function normalizeActivityTitle(title: string): string {
  if (!title) return title;
  const trimmed = String(title)
    .trim()
    .replace(/[.\s]+$/, "");
  const isShouting = /[A-Z]/.test(trimmed) && !/[a-z]/.test(trimmed) && trimmed.includes(" ");
  if (!isShouting) return trimmed;
  return trimmed.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Was called as resolveCoordinates(act.address) — but resolveCoordinates
// takes (name, destination), two required params. address ended up
// bound to `name` and `destination` was simply undefined, so the actual
// upstream search became "<address>, undefined" — a large share of why
// Atlas-added/edited activities never got coordinates and lost their
// View-on-map icon entirely (live-reported). Fixed call sites pass the
// activity's own title/placeName as the name (matches the exact pattern
// AiUtilitiesService's other real caller of this method already uses)
// and the trip's real destination.
async function tryResolveCoords(act: any, destination: string, aiService?: any): Promise<void> {
  // Guard on both latitude/longitude field spellings — act.lat/act.lon is
  // the app's canonical name (ActivityFormDialog, TripMap, AI-generated
  // activities all use it), but this function itself writes latitude/
  // longitude. Only checking .latitude meant an activity that already had
  // real .lat/.lon (just not .latitude) got needlessly re-geocoded on every
  // edit — harmless to the data (both field pairs end up populated) but a
  // wasted geocode call each time (code-review finding, 2026-09-03).
  if (act.latitude || act.lat || !aiService?.resolveCoordinates) return;
  const name = act.placeName || act.title;
  if (!name) return;
  try {
    const coords = await aiService.resolveCoordinates(name, destination);
    if (coords) {
      act.latitude = coords.lat;
      act.longitude = coords.lon;
    }
  } catch {
    // best-effort — an activity with no coordinates just doesn't get a
    // View-on-map icon, it's not fatal to the edit itself
  }
}

export async function modifyItineraryHandler(
  args: {
    tripId: string;
    userId: string;
    action: "replace_day" | "add_activity" | "remove_activity" | "swap_activities";
    dayIndex: number;
    activityId?: string;
    activity?: any;
    activities?: any[];
  },
  deps?: { aiService?: any; TripModel?: any },
): Promise<ToolResult> {
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

    const Model = deps?.TripModel || TripModel;
    const accessFilter = {
      _id: tripId,
      $or: [{ userId }, { collaborators: { $elemMatch: { userId, role: "editor" } } }],
    };
    const doc = await Model.findOne(accessFilter);
    if (!doc) {
      return { success: false, error: "Trip not found", durationMs: Date.now() - start };
    }

    const lastUpdatedAt = doc.updatedAt;
    const itinerary = JSON.parse(JSON.stringify(doc.itinerary || []));
    const dayIndex = args.dayIndex;

    if (dayIndex < 0 || dayIndex >= itinerary.length) {
      return {
        success: false,
        error: `Invalid dayIndex: ${dayIndex}. Trip has ${itinerary.length} days.`,
        durationMs: Date.now() - start,
      };
    }

    let message = "";
    const modeler = new FeasibilityModeler();

    switch (args.action) {
      case "replace_day": {
        if (!args.activities) {
          return {
            success: false,
            error: "activities array required for replace_day",
            durationMs: Date.now() - start,
          };
        }

        // Try to resolve coordinates for activities that lack them
        for (const act of args.activities) {
          await tryResolveCoords(act, doc.destination, deps?.aiService);
          if (act.title) act.title = normalizeActivityTitle(act.title);
          if (act.placeName) act.placeName = normalizeActivityTitle(act.placeName);
        }

        itinerary[dayIndex].activities = args.activities.map((act: any) => ({
          id: act.id || nanoid(8),
          ...act,
        }));
        message = `Day ${dayIndex + 1} itinerary completely replaced.`;
        break;
      }

      case "add_activity": {
        if (!args.activity) {
          return {
            success: false,
            error: "activity object required for add_activity",
            durationMs: Date.now() - start,
          };
        }

        const act = { ...args.activity };
        await tryResolveCoords(act, doc.destination, deps?.aiService);
        if (act.title) act.title = normalizeActivityTitle(act.title);
        if (act.placeName) act.placeName = normalizeActivityTitle(act.placeName);

        const newActivity = {
          id: act.id || nanoid(8),
          ...act,
        };
        itinerary[dayIndex].activities.push(newActivity);
        message = `Added activity "${newActivity.title}" to Day ${dayIndex + 1}.`;
        break;
      }
      // ... [keeping existing remove/swap logic]
      case "remove_activity": {
        if (!args.activityId) {
          return {
            success: false,
            error: "activityId required for remove_activity",
            durationMs: Date.now() - start,
          };
        }
        const initialCount = itinerary[dayIndex].activities.length;
        itinerary[dayIndex].activities = itinerary[dayIndex].activities.filter(
          (a: any) => a.id !== args.activityId && a.title !== args.activityId,
        );
        if (itinerary[dayIndex].activities.length === initialCount) {
          return {
            success: false,
            error: `Activity with ID/Title "${args.activityId}" not found on Day ${dayIndex + 1}`,
            durationMs: Date.now() - start,
          };
        }
        message = `Removed activity "${args.activityId}" from Day ${dayIndex + 1}.`;
        break;
      }

      case "swap_activities": {
        if (!args.activityId || !args.activity) {
          return {
            success: false,
            error: "activityId and new activity object required for swap_activities",
            durationMs: Date.now() - start,
          };
        }
        const idx = itinerary[dayIndex].activities.findIndex(
          (a: any) => a.id === args.activityId || a.title === args.activityId,
        );
        if (idx === -1) {
          return {
            success: false,
            error: `Activity "${args.activityId}" not found on Day ${dayIndex + 1}`,
            durationMs: Date.now() - start,
          };
        }

        const act = { ...args.activity };
        await tryResolveCoords(act, doc.destination, deps?.aiService);
        if (act.title) act.title = normalizeActivityTitle(act.title);
        if (act.placeName) act.placeName = normalizeActivityTitle(act.placeName);

        itinerary[dayIndex].activities[idx] = {
          ...itinerary[dayIndex].activities[idx],
          ...act,
          id: itinerary[dayIndex].activities[idx].id,
        };
        message = `Updated activity "${args.activityId}" on Day ${dayIndex + 1}.`;
        break;
      }

      default:
        return {
          success: false,
          error: `Unknown action: ${args.action}`,
          durationMs: Date.now() - start,
        };
    }

    // Auto-sort by time
    itinerary[dayIndex].activities.sort((a: any, b: any) => {
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

    // FEASIBILITY CHECK
    const evaluation = modeler.evaluatePlan(
      { itinerary, currency: doc.currency },
      { budget: doc.budget, travelStyle: doc.travelStyle },
    );

    if (!evaluation.isFeasible) {
      return {
        success: false,
        error: "Proposed itinerary change is physically or logistically infeasible.",
        data: {
          corrections: evaluation.corrections,
          feasibilityScore: evaluation.feasibilityScore,
        },
        durationMs: Date.now() - start,
      };
    }

    // Optimistic concurrency: only write if nobody else touched this trip
    // since we read it (the feasibility check above needs the full,
    // pre-write itinerary state, so this can't be a pure atomic op).
    const written = await Model.findOneAndUpdate(
      { ...accessFilter, updatedAt: lastUpdatedAt },
      { $set: { itinerary } },
      { new: true },
    );
    if (!written) {
      return {
        success: false,
        error: "Trip was modified by someone else at the same time. Please retry.",
        durationMs: Date.now() - start,
      };
    }

    // No excludeUserId — unlike a REST-form edit (where the actor's own
    // screen already updated locally from the response), Atlas executes
    // this ON BEHALF of the user in their own open tab, which is exactly
    // the tab that needs to hear about its own change. Excluding the
    // actor meant the one person guaranteed to be looking at this trip
    // right now never got the live update, and had to reload to see
    // what Atlas just did — live-reported.
    socketService.broadcastMutation(tripId, {
      type: "itinerary-updated",
      data: written.itinerary,
    });

    return {
      success: true,
      data: {
        message,
        dayIndex,
        activities: itinerary[dayIndex].activities,
        feasibilityScore: evaluation.feasibilityScore,
        warnings: evaluation.corrections.filter(
          (c) => !c.includes("impossible") && !c.includes("Conflict"),
        ),
        mutations: [{ type: "itinerary_updated", tripId, dayIndex }],
      },
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Itinerary modification failed",
      durationMs: Date.now() - start,
    };
  }
}
