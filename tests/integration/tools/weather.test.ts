import { describe, it, expect } from "vitest";
import { weatherHandler } from "../../../server/agent/tools/handlers/weatherHandler";

describe("[INTEGRATION] weatherHandler — Open-Meteo", () => {
  it("fetches real weather for Tokyo (lat/lon)", async () => {
    const result = await weatherHandler({ location: "35.6762,139.6503" });
    
    if (!result.success) console.error("Weather (Tokyo) Error:", result.error);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.current.temperature).toBeTypeOf("number");
  });

  it("fetches real weather for London (city name)", async () => {
    const result = await weatherHandler({ location: "London" });
    
    if (!result.success) console.error("Weather (London) Error:", result.error);
    expect(result.success).toBe(true);
    expect(result.data.forecast.length).toBeGreaterThan(0);
  });
});
