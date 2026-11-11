import { describe, it, expect } from "vitest";
import { friendlyMessage } from "../../client/src/lib/queryClient";

describe("friendlyMessage", () => {
  it("keeps the server's own short message for client errors", () => {
    expect(
      friendlyMessage(409, JSON.stringify({ error: "Someone else just changed this list." })),
    ).toBe("Someone else just changed this list.");
  });
  it("never shows raw server bodies", () => {
    expect(friendlyMessage(500, '{"error":"TypeError: x is undefined"}')).toBe(
      "Something went wrong on our side. Please try again.",
    );
    expect(friendlyMessage(404, "<html>Not Found</html>")).toBe(
      "That couldn't be found. It may have been deleted.",
    );
    expect(friendlyMessage(429, "")).toMatch(/Too many requests/);
  });
});
