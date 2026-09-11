// Daily reminder sweep — the app's only scheduled job. Started as a single
// pre-trip "N days to go" notification; now covers the whole trip
// lifecycle (pre-trip prep, day-by-day while traveling, and a warm
// send-off after) at fixed milestones, once each (guarded by
// trip.remindersSent).
//
// Render runs a single web instance, so an in-process cron is fine and
// no distributed lock is needed; the $addToSet on remindersSent is a
// soft guard against an accidental double-run anyway. If this ever scales
// to multiple instances, move this to a dedicated worker.

import cron from "node-cron";
import { TripModel, JournalEntryModel, PackingListModel } from "@shared/schema";
import { notifyTripParticipants } from "./notifications";
import { weatherHandler } from "./agent/tools/handlers/weatherHandler";

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

// Real numbers, not a generic "check your list" — how many of a trip's
// packing items are actually checked off right now.
async function packingProgressLine(tripId: string): Promise<string | null> {
  const lists = await PackingListModel.find({ tripId });
  const items = lists.flatMap((l) => l.items || []);
  if (items.length === 0) return null;
  const packed = items.filter((i) => i.packed).length;
  if (packed >= items.length) return "Your packing list is fully checked off — nice.";
  return `You've packed ${packed} of ${items.length} items so far.`;
}

// Best-effort — weatherHandler already has its own cache/error handling
// (server/agent/tools/handlers/weatherHandler.ts), a failure here just
// means the reminder ships without the weather line, never blocks it.
async function weatherLine(destination: string): Promise<string | null> {
  try {
    const result = await weatherHandler({ location: destination });
    if (!result.success || !result.data) return null;
    const d = result.data as {
      conditionsSummary?: string;
      avgLowTemp?: number;
      avgHighTemp?: number;
    };
    if (d.avgLowTemp == null || d.avgHighTemp == null) return null;
    const conditions = (d.conditionsSummary || "mixed conditions").toLowerCase();
    return `Expect ${conditions}, around ${d.avgLowTemp}-${d.avgHighTemp}°C — pack accordingly.`;
  } catch {
    return null;
  }
}

interface TripDoc {
  _id: unknown;
  destination: string;
  days: number;
  budget?: number;
  currency?: string;
  expenses?: Array<{ amount: number }>;
  itinerary?: Array<{ dayIndex?: number; activities?: Array<{ title?: string; time?: string }> }>;
  remindersSent?: string[];
}

interface Milestone {
  key: string;
  days: number; // daysUntil(startDate) this fires at
  title: string;
  message: (trip: TripDoc) => Promise<string> | string;
}

const MILESTONES: Milestone[] = [
  {
    key: "T-7",
    days: 7,
    title: "One week to go",
    message: (t) =>
      `Your trip to ${t.destination} starts in a week — a good time to firm up the itinerary.`,
  },
  {
    key: "T-3",
    days: 3,
    title: "3 days until your trip",
    message: async (t) => {
      const packing = await packingProgressLine(String(t._id));
      return `Your trip to ${t.destination} is in 3 days.${packing ? " " + packing : " Check your packing list and bookings."}`;
    },
  },
  {
    key: "T-1",
    days: 1,
    title: "Your trip is tomorrow",
    message: async (t) => {
      const weather = await weatherLine(t.destination);
      return (
        `You leave for ${t.destination} tomorrow. Have a great trip! We're glad to be part of this journey with you.` +
        (weather ? ` ${weather}` : "") +
        ` One last thing — the Emergency page has local numbers for ${t.destination}, worth a quick look before you go.`
      );
    },
  },
  {
    key: "start",
    days: 0,
    title: "Your trip starts today",
    message: (t) =>
      `Today's the day — your trip to ${t.destination} begins. Safe travels, and have an amazing time!`,
  },
];

// First activity of a given itinerary day, for the daily "here's today"
// digest while a trip is in progress.
function firstActivityLine(trip: TripDoc, dayIndex: number): string | null {
  const day = trip.itinerary?.find((d) => d.dayIndex === dayIndex);
  const first = day?.activities?.[0];
  if (!first?.title) return null;
  return first.time
    ? `First up today: ${first.title} at ${first.time}.`
    : `First up today: ${first.title}.`;
}

function totalSpent(trip: TripDoc): number {
  return (trip.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
}

export async function runReminderSweep(): Promise<void> {
  const now = new Date();
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const horizon = new Date(todayMidnight);
  horizon.setDate(horizon.getDate() + 8);
  // Trips that started well in the past are done mattering here — bounds
  // the query without needing to know each trip's own length up front.
  // 60 days comfortably covers any realistic trip plus a few days' buffer
  // past checkout for the "welcome back" notice below.
  const lookback = new Date(todayMidnight);
  lookback.setDate(lookback.getDate() - 60);

  const trips = await TripModel.find({
    status: { $ne: "completed" },
    startDate: { $ne: null, $gte: lookback, $lte: horizon },
  });

  let sent = 0;
  const fire = async (
    trip: (typeof trips)[number],
    key: string,
    title: string,
    message: string,
    link?: string,
  ) => {
    if (trip.remindersSent?.includes(key)) return;
    await notifyTripParticipants(trip, "", {
      type: "trip-reminder",
      title,
      message,
      link: link ?? `/app/trips/${String(trip._id)}`,
      tripId: String(trip._id),
    });
    await TripModel.updateOne({ _id: trip._id }, { $addToSet: { remindersSent: key } });
    sent++;
  };

  for (const trip of trips) {
    if (!trip.startDate) continue;
    const d = daysUntil(trip.startDate);

    // ── Pre-trip / start milestones ──────────────────────────────────
    const milestone = MILESTONES.find((m) => m.days === d);
    if (milestone) {
      await fire(trip, milestone.key, milestone.title, await milestone.message(trip));
      continue;
    }

    if (d >= 0) continue; // still more than a week out, or between milestones — nothing to do yet

    // ── In progress / after the trip ─────────────────────────────────
    const dayOfTrip = -d; // 0 = start day (handled above), 1 = second day, ...
    if (dayOfTrip > trip.days + 2) continue; // too long ago to still matter

    if (dayOfTrip > 0 && dayOfTrip < trip.days - 1) {
      // A real middle day of a multi-day trip.
      const activity = firstActivityLine(trip, dayOfTrip);
      await fire(
        trip,
        `day-${dayOfTrip}`,
        `Day ${dayOfTrip + 1} in ${trip.destination}`,
        activity || `Hope ${trip.destination} is treating you well today!`,
      );

      // Each of these fires at most once across the whole trip, on
      // whichever day's sweep first finds the condition true.
      if (!trip.remindersSent?.includes("journal-nudge")) {
        const hasEntry = await JournalEntryModel.exists({ tripId: trip._id });
        if (!hasEntry) {
          await fire(
            trip,
            "journal-nudge",
            "Capture this trip while it's fresh",
            "You haven't logged a journal entry for this trip yet — even a few lines now beat trying to remember it all later.",
            `/app/journal`,
          );
        }
      }

      if (trip.budget && !trip.remindersSent?.includes("budget-alert")) {
        const spent = totalSpent(trip);
        const elapsedRatio = (dayOfTrip + 1) / trip.days;
        const spendRatio = spent / trip.budget;
        // Spending noticeably ahead of the trip's own pace — a real signal,
        // not "you spent money" for its own sake.
        if (spendRatio > elapsedRatio + 0.25 && spendRatio > 0.5) {
          await fire(
            trip,
            "budget-alert",
            "A quick budget check-in",
            `You're ${Math.round(spendRatio * 100)}% through your budget with ${trip.days - dayOfTrip - 1} day(s) left — worth a glance at the Budget tab.`,
            `/app/trips/${String(trip._id)}?tab=budget`,
          );
        }
      }
    } else if (dayOfTrip === trip.days - 1 && trip.days > 1) {
      // Last day.
      await fire(
        trip,
        "last-day",
        `Last day in ${trip.destination}`,
        `It's your last day in ${trip.destination} — anything left on the list? Make it count.`,
      );
    } else if (dayOfTrip === trip.days) {
      // The day after checkout — a warm send-off, and an invitation to
      // share how it went (real per-trip feedback, not a generic form).
      await fire(
        trip,
        "post-trip",
        "Welcome back!",
        `Hope ${trip.destination} was everything you hoped for. We'd love to hear how it went — takes a minute, and helps us make the next one even better.`,
        `/app/feedback?tripId=${String(trip._id)}&type=trip-experience&destination=${encodeURIComponent(trip.destination)}`,
      );
    }
  }

  if (sent > 0) console.log(`[scheduler] reminder sweep sent ${sent} notification(s)`);
}

export function startScheduler(): void {
  // 09:00 server time, every day.
  cron.schedule("0 9 * * *", () => {
    runReminderSweep().catch((e) => console.error("[scheduler] reminder sweep failed:", e));
  });
}
