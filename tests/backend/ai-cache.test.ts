/** @vitest-environment node */
import { describe, it, expect, vi } from "vitest";
import { AiUtilitiesService } from "../../server/AiUtilitiesService";

// Controllers build a new AiUtilitiesService per request; the cache must
// still be shared, or every trip-page view re-bills the same AI calls.
describe("AiUtilitiesService cache", () => {
  it("serves quiet-place suggestions from cache across instances", async () => {
    const reply = {
      choices: [
        { message: { content: JSON.stringify({ spots: [{ name: "Sisodia Rani Garden" }] }) } },
      ],
    };
    const a = new AiUtilitiesService("fake-key");
    const b = new AiUtilitiesService("fake-key");
    const createA = vi.spyOn((a as any).openai.chat.completions, "create").mockResolvedValue(reply);
    const createB = vi.spyOn((b as any).openai.chat.completions, "create").mockResolvedValue(reply);

    const first = await a.getQuietPlaceSuggestions("Jaipur-cache-test");
    const second = await b.getQuietPlaceSuggestions("  jaipur-CACHE-test ");

    expect(createA).toHaveBeenCalledTimes(1);
    expect(createB).not.toHaveBeenCalled();
    expect(second).toEqual(first);
  });

  it("does not cache a failed generation", async () => {
    const svc = new AiUtilitiesService("fake-key");
    const create = vi
      .spyOn((svc as any).openai.chat.completions, "create")
      .mockRejectedValue(new Error("402"));
    await svc.getQuietPlaceSuggestions("Nowhere-cache-test");
    await svc.getQuietPlaceSuggestions("Nowhere-cache-test");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
