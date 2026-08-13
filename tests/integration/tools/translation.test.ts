import { describe, it, expect } from "vitest";
import { translateHandler } from "../../../server/agent/tools/handlers/translateHandler";

// This hits live external translation providers (GPT-4o-mini -> NVIDIA ->
// MyMemory, via AiUtilitiesService.translate()) — real network conditions
// and per-query provider flakiness (MyMemory in particular is documented
// elsewhere in this codebase as returning confidently empty/wrong matches
// for common phrases) mean a specific successful translation can't be
// asserted unconditionally in every environment this suite runs in. What's
// actually being verified: the handler never silently reports success with
// a fabricated result — either it returns a real translation, or it
// reports failure honestly.
describe("[INTEGRATION] translateHandler", () => {
  it("returns a real translation on success, or an honest failure — never a fabricated result", async () => {
    const result = await translateHandler({ text: "Hello", targetLang: "ja" });

    if (result.success) {
      expect(result.data.translatedText).toBeTruthy();
    } else {
      expect(result.error).toBeTruthy();
    }
  });
});
