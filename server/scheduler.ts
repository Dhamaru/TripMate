// Daily reminder sweep — the app's only scheduled job. Renders a
// "trip in N days" notification for each upcoming trip at fixed
// milestones, once each (guarded by trip.remindersSent).
//
// Render runs a single web instance, so an in-process cron is fine and
// no distributed lock is needed; the $addToSet on remindersSent is a
// soft guard against an accidental double-run anyway. If this ever scales
// to multiple instances, move this to a dedicated worker.

import cron from "node-cron";
import { TripModel } from "@shared/schema";
import { notifyTripParticipants } from "./notifications";

interface Milestone {
  key: string;
  days: number;
  title: string;
  message: (destination: string) => string;
}

const MILESTONES: Milestone[] = [
  {
    key: "T-7",
    days: 7,
    title: "One week to go",
    message: (d) => `Your trip to ${d} starts in a week — a good time to firm up the itinerary.`,
  },
  {
    key: "T-3",
    days: 3,
    title: "3 days until your trip",
    message: (d) => `Your trip to ${d} is in 3 days. Check your packing list and bookings.`,
  },
  {
    key: "T-1",
    days: 1,
    title: "Your trip is tomorrow",
    message: (d) => `You leave for ${d} tomorrow. Have a great trip!`,
  },
  {
    key: "start",
    days: 0,
    title: "Your trip starts today",
    message: (d) => `Today's the day — your trip to ${d} begins. Safe travels!`,
  },
];

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export async function runReminderSweep(): Promise<void> {
  const now = new Date();
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);
  const horizon = new Date(todayMidnight);
  horizon.setDate(horizon.getDate() + 8);

  const trips = await TripModel.find({
    status: { $ne: "completed" },
    startDate: { $ne: null, $gte: todayMidnight, $lte: horizon },
  });

  let sent = 0;
  for (const trip of trips) {
    if (!trip.startDate) continue;
    const d = daysUntil(trip.startDate);
    const milestone = MILESTONES.find((m) => m.days === d);
    if (!milestone) continue;
    if (trip.remindersSent?.includes(milestone.key)) continue;

    // actor "" — a reminder isn't caused by any user, so notify everyone
    // on the trip (notifyTripParticipants only excludes a real actor id).
    await notifyTripParticipants(trip, "", {
      type: "trip-reminder",
      title: milestone.title,
      message: milestone.message(trip.destination),
      link: `/app/trips/${String(trip._id)}`,
      tripId: String(trip._id),
    });
    await TripModel.updateOne({ _id: trip._id }, { $addToSet: { remindersSent: milestone.key } });
    sent++;
  }
  if (sent > 0) console.log(`[scheduler] reminder sweep sent ${sent} notification(s)`);
}

export function startScheduler(): void {
  // 09:00 server time, every day.
  cron.schedule("0 9 * * *", () => {
    runReminderSweep().catch((e) => console.error("[scheduler] reminder sweep failed:", e));
  });
  // Catch-up run shortly after boot, in case the process was down at 09:00
  // (Render cold starts, deploys). remindersSent makes this idempotent.
  setTimeout(() => {
    runReminderSweep().catch((e) => console.error("[scheduler] boot sweep failed:", e));
  }, 60_000);
  console.log("[scheduler] daily reminder job scheduled (09:00)");
}
