// Shared "HH:MM AM/PM" <-> minutes-from-midnight helpers. Previously
// duplicated inline inside ItineraryManager.tsx's chronology validator;
// extracted so TripMap.tsx's "add pin to itinerary" flow can use the same
// logic to avoid the exact bug that validator exists to catch — two
// activities added back-to-back both defaulting to the same hardcoded
// time and getting flagged as an overlap.

export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  try {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    return hours * 60 + (minutes || 0);
  } catch {
    return 0;
  }
}

export function minutesToTimeString(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  let hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const modifier = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${modifier}`;
}

/**
 * The next sensible start time for a new activity added to a day, given
 * that day's existing activities — the end time of the latest-ending
 * activity, rounded up to the nearest 30 minutes, or a default start time
 * (9:00 AM) if the day has nothing scheduled yet. This is what a
 * "add this place to my day" flow should default to instead of a fixed
 * hardcoded time that collides with whatever was added before it.
 */
export function nextAvailableTime(
  existingActivities: Array<{ time?: string; duration_minutes?: number }>,
  defaultStart = "09:00 AM",
): string {
  if (!existingActivities || existingActivities.length === 0) return defaultStart;

  let latestEnd = 0;
  for (const activity of existingActivities) {
    const start = parseTimeToMinutes(activity.time);
    const end = start + (activity.duration_minutes || 60);
    if (end > latestEnd) latestEnd = end;
  }
  if (latestEnd === 0) return defaultStart;

  const roundedUp = Math.ceil(latestEnd / 30) * 30;
  return minutesToTimeString(roundedUp);
}
