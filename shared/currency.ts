// Free-text currency (Atlas or older data may store "₹", "Rs", "rupees")
// to an ISO code, so totals don't drop expenses that are really the trip's
// currency. No imports: shared by client and server.
const ALIASES: Record<string, string> = {
  "₹": "INR",
  RS: "INR",
  "RS.": "INR",
  RUPEE: "INR",
  RUPEES: "INR",
  $: "USD",
  US$: "USD",
  DOLLAR: "USD",
  DOLLARS: "USD",
  "€": "EUR",
  EURO: "EUR",
  EUROS: "EUR",
  "£": "GBP",
  POUND: "GBP",
  POUNDS: "GBP",
  "¥": "JPY",
  YEN: "JPY",
};

export function normalizeCurrency(value: unknown, fallback = "INR"): string {
  const v = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!v) return fallback.toUpperCase();
  return ALIASES[v] ?? v;
}
