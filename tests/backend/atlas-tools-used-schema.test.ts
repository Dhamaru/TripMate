/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { AtlasConversationModel } from "@shared/schema";

describe("Atlas conversation schema", () => {
  it("keeps toolsUsed on assistant messages so history restores tool badges", () => {
    const doc = new AtlasConversationModel({
      tripId: "trip-1",
      userId: "user-1",
      messages: [
        {
          role: "assistant",
          content: "It is 33°C.",
          toolsUsed: ["get_weather"],
        },
      ],
    });

    expect(doc.toObject().messages[0].toolsUsed).toEqual(["get_weather"]);
  });
});
