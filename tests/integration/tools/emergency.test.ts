import { describe, it, expect } from "vitest";
import { emergencyHandler } from "../../../server/agent/tools/handlers/emergencyHandler";

describe("[INTEGRATION] emergencyHandler", () => {
  it("gets emergency info for Paris", async () => {
    const result = await emergencyHandler({ destination: "Paris" }, {
        aiService: {
            emergency: async () => ({ police: "17" })
        } as any
    });
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
