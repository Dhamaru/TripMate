import { describe, it, expect } from "vitest";
import { emergencyHandler } from "../../../server/agent/tools/handlers/emergencyHandler";

describe("[INTEGRATION] emergencyHandler", () => {
  it("gets emergency info for Paris", async () => {
    const result = await emergencyHandler(
      { destination: "Paris" },
      {
        aiService: {
          emergency: async () => ({ police: "17" }),
        } as any,
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it("maps plural infoType to singular item types", async () => {
    const result = await emergencyHandler(
      { destination: "Pune-plural-test", infoType: "pharmacies" },
      {
        aiService: {
          emergency: async () => [
            { type: "pharmacy", name: "A" },
            { type: "hospital", name: "B" },
          ],
        } as any,
      },
    );
    expect(result.data).toEqual([{ type: "pharmacy", name: "A" }]);
  });

  it("does not cache an empty result", async () => {
    let items: unknown[] = [];
    const deps = { aiService: { emergency: async () => items } as any };
    await emergencyHandler({ destination: "Pune-empty-cache-test" }, deps);
    items = [{ type: "hospital", name: "City Hospital" }];
    const second = await emergencyHandler({ destination: "Pune-empty-cache-test" }, deps);
    expect(second.data).toEqual(items);
  });
});
