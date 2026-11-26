import { normalizeCurrency } from "@shared/currency";

type Money = { amount?: number | string; currency?: string };

/**
 * Split expenses into the trip's currency and everything else. Totals used
 * to add a "$20 lunch" on an INR trip as ₹20; with no exchange rate to hand,
 * other currencies are kept out of the total and listed separately instead.
 */
export function splitByCurrency(expenses: Money[] | undefined, tripCurrency = "INR") {
  const home = normalizeCurrency(tripCurrency);
  let inTripCurrency = 0;
  const other: Record<string, number> = {};
  for (const e of expenses ?? []) {
    const amount = Number(e.amount) || 0;
    const cur = normalizeCurrency(e.currency, home);
    if (cur === home) inTripCurrency += amount;
    else other[cur] = (other[cur] || 0) + amount;
  }
  return { inTripCurrency, other };
}

/** "USD 20, EUR 5" */
export const formatOther = (other: Record<string, number>) =>
  Object.entries(other)
    .map(([c, n]) => `${c} ${n.toLocaleString()}`)
    .join(", ");
