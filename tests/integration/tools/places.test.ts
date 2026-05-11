import { describe, it, expect } from "vitest";
import { placesHandler } from "../../../server/agent/tools/handlers/placesHandler";

describe("[INTEGRATION] placesHandler — Google Places (requires API Key)", () => {
  it("searches for hotels in Tokyo (mocked or real if key exists)", async () => {
    // Note: This relies on GOOGLE_API_KEY in .env
    const result = await placesHandler({ query: "hotels in Tokyo" }, {
        aiService: {
            searchPlaces: async () => [{ name: "Sample Hotel", rating: 4.5 }]
        } as any
    });
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
