export function safeParsePlan(input: any): any | null {
  if (input == null) return null;
  if (typeof input === 'object') return input;
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch {}
    const s = input.trim();
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = s.slice(start, end + 1);
      try { return JSON.parse(candidate); } catch {}
    }
  }
  return null;
}

export function isValidPlanLike(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (!obj.destination || !obj.itinerary) return false;
  if (!Array.isArray(obj.itinerary)) return false;
  return true;
}
