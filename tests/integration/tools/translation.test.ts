import { describe, it, expect } from "vitest";
import { translateHandler } from "../../../server/agent/tools/handlers/translateHandler";

describe("[INTEGRATION] translateHandler — MyMemory", () => {
  it("translates text to Japanese", async () => {
    const result = await translateHandler({ text: "Hello", targetLang: "ja" });
    
    expect(result.success).toBe(true);
    expect(result.data.translatedText).toBeDefined();
  });
});
