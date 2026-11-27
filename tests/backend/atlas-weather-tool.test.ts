/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from "vitest";
import { weatherHandler } from "../../server/agent/tools/handlers/weatherHandler";

describe("Atlas weather tool", () => {
  afterEach(() => vi.unstubAllGlobals());

  const failedFetch = () => vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));

  it("reuses already-cached app weather when the live forecast fails", async () => {
    const cached = {
      current: { temperature: 36, condition: "Haze" },
      forecast: [],
      recommendations: [],
      source: "ai",
    };
    const peekWeather = vi.fn(() => cached);
    vi.stubGlobal("fetch", failedFetch());

    const result = await weatherHandler(
      { location: "AtlasTestTown" },
      { aiService: { peekWeather } },
    );

    expect(result.success).toBe(true);
    expect((result.data as any).current.temperature).toBe(36);
    expect(peekWeather).toHaveBeenCalledWith("AtlasTestTown");
  });

  it("still reports failure when no cached weather exists", async () => {
    vi.stubGlobal("fetch", failedFetch());
    const result = await weatherHandler(
      { location: "AtlasTestTown" },
      { aiService: { peekWeather: () => null } },
    );
    expect(result.success).toBe(false);
  });
});
