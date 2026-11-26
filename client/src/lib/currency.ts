// Shared currency-code -> display-symbol map. Previously duplicated inline
// in TripDetail.tsx; extracted here so every place that needs to show a
// trip's currency (budget summaries, activity forms, expense forms) uses
// the same mapping instead of drifting or hardcoding "$".
const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  JPY: "¥",
  CNY: "¥",
};

export function getCurrencySymbol(currency?: string): string {
  if (!currency) return CURRENCY_SYMBOLS.INR;
  return CURRENCY_SYMBOLS[currency] || currency;
}
