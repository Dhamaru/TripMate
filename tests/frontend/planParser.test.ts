import { describe, it, expect } from "vitest";
import { safeParsePlan, isValidPlanLike } from "../../client/src/lib/planParser";

describe("planParser", () => {
  // isValidPlanLike requires a non-empty itinerary where every day has at
  // least one activity (planParser.ts:21-34) -- an empty itinerary is
  // treated as a broken plan, not a sparse-but-valid one.
  const obj = {
    destination: "X",
    itinerary: [{ day: 1, activities: [{ title: "Arrive" }] }],
  };

  it("passes an already-parsed object through unchanged", () => {
    expect(safeParsePlan(obj)).toEqual(obj);
    expect(isValidPlanLike(obj)).toBe(true);
  });

  it("parses a raw JSON string", () => {
    expect(safeParsePlan(JSON.stringify(obj))).toEqual(obj);
  });

  it("extracts JSON embedded in surrounding text", () => {
    const textWithJson = `Hello\n\n${JSON.stringify(obj)}\nThanks`;
    expect(safeParsePlan(textWithJson)).toEqual(obj);
  });

  it("returns null for non-JSON input", () => {
    expect(safeParsePlan("not json")).toBeNull();
    expect(isValidPlanLike(null)).toBe(false);
  });

  it("rejects a plan with an empty itinerary", () => {
    expect(isValidPlanLike({ destination: "X", itinerary: [] })).toBe(false);
  });
});
