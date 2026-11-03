// Rough round-trip cost of getting from the trip's origin to its destination,
// shown in the Budget tab as "Getting there & back (estimate)".
// Free services only: Nominatim for coordinates, Frankfurter for currency.

import { TripModel } from "@shared/schema";
import { socketService } from "./SocketService";

// INR per person, one way: [base, per km]. Rough Indian fares (3AC train,
// AC sleeper bus, economy flight). Car is per vehicle (fuel + tolls), 4 seats.
const FARES: Record<string, [number, number]> = {
  flight: [2000, 4.5],
  train: [200, 1.5],
  bus: [100, 1.5],
};
const CAR_PER_KM = 9;

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Planner never asks for a mode, so pick the usual one for the distance. */
export function pickMode(km: number, mode?: string, international?: boolean): string {
  if (mode && (Object.hasOwn(FARES, mode) || mode === "car")) return mode;
  if (international || km > 1000) return "flight";
  return km > 300 ? "train" : "bus";
}

/** Round trip for the whole group, in INR. Same-city trips cost nothing here. */
export function estimateTransitINR(
  km: number,
  groupSize: number,
  mode?: string,
  international?: boolean,
): number {
  if (!Number.isFinite(km) || km < 30) return 0;
  const people = Math.max(1, Math.floor(groupSize) || 1);
  const picked = pickMode(km, mode, international);
  const oneWay =
    picked === "car"
      ? CAR_PER_KM * km * Math.ceil(people / 4)
      : (FARES[picked][0] + FARES[picked][1] * km) * people;
  return Math.round(oneWay * 2);
}

// Nominatim allows 1 request/second per app. Background jobs that call it
// (this estimate, the activity-coords backfill) queue here so together they
// stay under that. ponytail: per-process only, fine on one Render instance.
let nominatimQueue: Promise<unknown> = Promise.resolve();
export function nominatimSearch(q: string): Promise<Response> {
  const run = nominatimQueue.then(() =>
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "TripMate/2.0.0 (kasivasl2005@gmail.com)" } },
    ),
  );
  nominatimQueue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 1100)));
  return run;
}

async function geocode(q: string): Promise<{ lat: number; lon: number } | null> {
  const res = await nominatimSearch(q);
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const [hit] = (await res.json()) as any[];
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

async function inrTo(currency: string): Promise<number> {
  if (currency === "INR") return 1;
  const res = await fetch(`https://api.frankfurter.app/latest?from=INR&to=${currency}`);
  if (!res.ok) throw new Error(`frankfurter ${res.status}`);
  const rate = (await res.json())?.rates?.[currency];
  return rate || 0; // currency Frankfurter doesn't cover: no estimate
}

const inFlight = new Set<string>();
// Trip views call this while the field is unset; after a network failure,
// wait before trying again instead of retrying on every view.
const lastFailure = new Map<string, number>();
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Compute and store trip.transitEstimate (in the trip's currency) if it is
 * still unset. A place that doesn't geocode stores 0 so it isn't retried;
 * a network failure stores nothing and is retried after RETRY_AFTER_MS.
 */
export async function refreshTransitEstimate(tripId: string): Promise<void> {
  if (inFlight.has(tripId)) return;
  if (Date.now() - (lastFailure.get(tripId) || 0) < RETRY_AFTER_MS) return;
  inFlight.add(tripId);
  try {
    const trip = await TripModel.findById(tripId).lean();
    if (!trip || !trip.origin || trip.transitEstimate !== undefined) return;
    const from = await geocode(trip.origin);
    const to = await geocode(trip.destination);
    let amount = 0;
    if (from && to) {
      const inr = estimateTransitINR(
        haversineKm(from, to),
        trip.groupSize,
        trip.transportMode,
        trip.isInternational,
      );
      if (inr > 0) amount = Math.round(inr * (await inrTo((trip.currency || "INR").toUpperCase())));
    }
    // Only fill if still unset and the route inputs haven't changed meanwhile.
    const updated = await TripModel.findOneAndUpdate(
      {
        _id: tripId,
        transitEstimate: { $exists: false },
        origin: trip.origin,
        destination: trip.destination,
        currency: trip.currency,
        groupSize: trip.groupSize,
        transportMode: trip.transportMode,
        isInternational: trip.isInternational,
      },
      { $set: { transitEstimate: amount } },
      { new: true },
    );
    if (updated) socketService.broadcastMutation(tripId, { type: "trip-refreshed", data: updated });
    lastFailure.delete(tripId);
  } catch (err) {
    lastFailure.set(tripId, Date.now());
    console.warn(`[transitEstimate] Failed for trip ${tripId}:`, (err as Error).message);
  } finally {
    inFlight.delete(tripId);
  }
}
