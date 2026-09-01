export function safeParsePlan(input: any): any | null {
  if (input == null) return null;
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {}
    const s = input.trim();
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = s.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {}
    }
  }
  return null;
}

export function isValidPlanLike(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (!obj.destination || !obj.itinerary) return false;
  if (!Array.isArray(obj.itinerary) || obj.itinerary.length === 0) return false;
  // A day with a zero-length activities array is a broken plan, not a valid
  // (if sparse) one — accepting it here let a stale/malformed cached plan
  // (server-side bug, since fixed) silently render as "0 Activities" for
  // every day instead of surfacing a real error the user could retry from.
  if (
    obj.itinerary.some((day: any) => !Array.isArray(day?.activities) || day.activities.length === 0)
  ) {
    return false;
  }
  return true;
}
