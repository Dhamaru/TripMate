/**
 * Best guess at the traveler's home currency. Time zone first: many people
 * in India browse with an en-GB or en-US language setting, which made the
 * planner default to £ GBP. Then the browser language's region.
 */
export function guessHomeCurrency(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/^Asia\/(Kolkata|Calcutta)$/.test(tz)) return "INR";
    const region = navigator.language.split("-")[1]?.toUpperCase();
    const byRegion: Record<string, string> = {
      IN: "INR",
      US: "USD",
      GB: "GBP",
      AU: "AUD",
      CA: "CAD",
      JP: "JPY",
      CN: "CNY",
      DE: "EUR",
      FR: "EUR",
      ES: "EUR",
      IT: "EUR",
    };
    return (region && byRegion[region]) || "USD";
  } catch {
    return "USD";
  }
}
