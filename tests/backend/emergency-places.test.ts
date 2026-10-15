/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from "vitest";
import { config } from "../../server/config";
import { AiUtilitiesService } from "../../server/AiUtilitiesService";

const place = (name: string, lat: number, lng: number) => ({
  name,
  vicinity: `${name} Road`,
  types: ["hospital"],
  geometry: { location: { lat, lng } },
});

describe("AiUtilitiesService.emergency", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns real nearby Places results for coordinates and never asks the LLM", async () => {
    (config as any).GOOGLE_API_KEY = "test-key";
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        results: url.includes("type=hospital") ? [place("City Hospital", 16.51, 80.64)] : [],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const svc = new AiUtilitiesService("fake-gemini-key");
    const llm = vi.spyOn((svc as any).openai.chat.completions, "create");

    const out = await svc.emergency("16.5404621,80.6345617");

    expect(llm).not.toHaveBeenCalled();
    expect(out).toEqual([
      expect.objectContaining({
        name: "City Hospital",
        type: "hospital",
        coordinates: { lat: 16.51, lon: 80.64 },
      }),
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("location=16.5404621,80.6345617");
  });

  it("does not cache an empty result, so a transient failure isn't pinned", async () => {
    (config as any).GOOGLE_API_KEY = "test-key";
    let hospitals: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => ({ results: url.includes("type=hospital") ? hospitals : [] }),
      })),
    );
    const svc = new AiUtilitiesService("fake-gemini-key");

    expect(await svc.emergency("16.5,80.6")).toEqual([]);
    hospitals = [place("City Hospital", 16.51, 80.64)];
    expect(await svc.emergency("16.5,80.6")).toHaveLength(1);
  });

  it("keeps only real diplomatic missions as embassies", async () => {
    (config as any).GOOGLE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => ({
          results: url.includes("keyword=embassy")
            ? [
                { ...place("Oaks Overseas", 16.49, 80.64), types: ["embassy", "travel_agency"] },
                { ...place("Exxeella Education Group", 16.49, 80.64), types: ["embassy"] },
                { ...place("U.S. Consulate General Hyderabad", 17.42, 78.33), types: ["embassy"] },
              ]
            : [],
        }),
      })),
    );
    const out = await new AiUtilitiesService("fake-gemini-key").emergency("16.5,80.6");
    expect(out.map((s) => s.name)).toEqual(["U.S. Consulate General Hyderabad"]);
  });
});
