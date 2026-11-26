/** @vitest-environment node */
import { describe, it, expect, vi } from "vitest";
import { budgetHandler } from "../../server/agent/tools/handlers/budgetHandler";

// The breakdown is computed asynchronously; without await, Atlas got back
// only {currency, travelStyle} and "succeeded" with no numbers.
describe("get_budget_breakdown", () => {
  it("returns the computed numbers", async () => {
    const calculateBudgetBreakdown = vi.fn().mockResolvedValue({
      accommodation: 4000,
      food: 2000,
      transport: 1500,
      activities: 1500,
      buffer: 1000,
      total: 10000,
    });
    const res: any = await budgetHandler(
      { totalBudget: 10000, travelStyle: "standard", currency: "inr" } as any,
      { aiService: { calculateBudgetBreakdown } } as any,
    );
    expect(res.success).toBe(true);
    expect(res.data.accommodation).toBe(4000);
    expect(res.data.total).toBe(10000);
    expect(res.data.currency).toBe("INR");
  });
});
