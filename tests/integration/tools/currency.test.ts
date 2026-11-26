import { describe, it, expect } from "vitest";
import { currencyHandler } from "../../../server/agent/tools/handlers/currencyHandler";

describe("[INTEGRATION] currencyHandler — Frankfurter", () => {
  it("converts USD to EUR", async () => {
    const result = await currencyHandler({ amount: 100, from: "USD", to: "EUR" });
    
    expect(result.success).toBe(true);
    expect(result.data.convertedAmount).toBeTypeOf("number");
    expect(result.data.rate).toBeTypeOf("number");
  });
});
