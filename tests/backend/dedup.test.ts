/** @vitest-environment node */
/**
 * Unit tests for the itinerary anti-repetition logic in
 * server/AiUtilitiesService.ts (wordsOf, distinguishingTokens,
 * finalizeAttractionDedup) plus a smoke test of the places/search
 * type=city (Autocomplete) route's error handling.
 *
 * Produced by a code-reviewer agent's technical-test-script pass over
 * commits aec2ad6/8af4e9a/b586a85/6eceb6f/e8f7bf7, which found two real
 * false-positive bugs before they shipped further:
 *   1. The specific-duplicate overlap ratio used Math.min(sizeA, sizeB) as
 *      its denominator, so a single shared token was enough to match
 *      against a much larger set ("National Museum" vs "National War
 *      Memorial" -> 1/min(1,3)=1.0, false merge). Fixed: Math.max.
 *   2. distinguishingTokens stripped a generic feature word ("fort",
 *      "museum"...) unconditionally, so a real, specific landmark that's
 *      JUST destination+genericWord ("Agra Fort", "Jaipur Museum") lost
 *      its only distinguishing signal. Fixed: only strip when 2+ tokens
 *      remain after destination+filler stripping.
 * Assertions below reflect the FIXED behavior.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { AiUtilitiesService } from "../../server/AiUtilitiesService";

// The dedup helpers are private methods in the TS source, which is a
// compile-time-only restriction — at runtime they're plain properties on
// the instance, callable like any other method.

let svc: any;

beforeAll(() => {
  svc = new AiUtilitiesService();
});

describe("isPlanSuspiciouslyShort", () => {
  // Live-reported: parseSchedule's own JSON response said `days: 10` but
  // `itinerary` had exactly 1 entry — a self-contradictory result that
  // the old retry-trigger (itinerary.length === 0 only) never caught.
  it("flags a plan whose itinerary is under half its own claimed day count", () => {
    const plan = { days: 10, itinerary: [{ day: 1, activities: [] }] };
    expect(svc.isPlanSuspiciouslyShort(plan)).toBe(true);
  });

  it("does NOT flag a plan whose itinerary roughly matches its claimed days", () => {
    const plan = { days: 3, itinerary: [{}, {}, {}] };
    expect(svc.isPlanSuspiciouslyShort(plan)).toBe(false);
  });

  it("does NOT flag a plan at exactly the half-of-days boundary (5 of 10)", () => {
    const plan = { days: 10, itinerary: Array(5).fill({}) };
    expect(svc.isPlanSuspiciouslyShort(plan)).toBe(false);
  });

  it("does NOT flag a genuinely 1-day trip (days: 1) even with 1 itinerary entry", () => {
    // days > 1 guard — a real 1-day trip shouldn't be treated as
    // "suspiciously short" just because 1 < ceil(1/2) would be false
    // anyway, but this pins the intent explicitly.
    const plan = { days: 1, itinerary: [{}] };
    expect(svc.isPlanSuspiciouslyShort(plan)).toBe(false);
  });

  it("does NOT flag when days is missing or not a number (nothing to compare against)", () => {
    expect(svc.isPlanSuspiciouslyShort({ itinerary: [{}] })).toBe(false);
    expect(svc.isPlanSuspiciouslyShort({ days: "10", itinerary: [{}] })).toBe(false);
  });

  it("does NOT flag when itinerary isn't an array", () => {
    expect(svc.isPlanSuspiciouslyShort({ days: 10, itinerary: null })).toBe(false);
  });

  it("handles a null/undefined plan safely", () => {
    expect(svc.isPlanSuspiciouslyShort(null)).toBe(false);
    expect(svc.isPlanSuspiciouslyShort(undefined)).toBe(false);
  });
});

describe("wordsOf", () => {
  it("strips non-ASCII (Devanagari) to an empty set — documented limitation, not a claimed fix", () => {
    const result = svc.wordsOf("ताज महल");
    expect(result.size).toBe(0);
  });

  it("keeps lowercase alphanumeric tokens", () => {
    const result = svc.wordsOf("Red Fort");
    expect(result.has("red")).toBe(true);
    expect(result.has("fort")).toBe(true);
  });

  it("FIX VERIFIED: keeps 2-character tokens ('Da Nang', 'Ha Long Bay') — was filtered at length>2, now length>1", () => {
    const daNang = svc.wordsOf("Da Nang");
    expect(daNang.has("da")).toBe(true);
    expect(daNang.has("nang")).toBe(true);

    const haLong = svc.wordsOf("Ha Long Bay");
    expect(haLong.has("ha")).toBe(true);
    expect(haLong.has("long")).toBe(true);
    expect(haLong.has("bay")).toBe(true);
  });

  it("still filters single-character tokens", () => {
    const result = svc.wordsOf("Humayun's Tomb");
    expect(result.has("s")).toBe(false);
    expect(result.has("humayun")).toBe(true);
    expect(result.has("tomb")).toBe(true);
  });

  it("keeps numeric-leading tokens — '7th Avenue'", () => {
    const result = svc.wordsOf("7th Avenue");
    expect(result.has("7th")).toBe(true);
    expect(result.has("avenue")).toBe(true);
  });
});

describe("distinguishingTokens", () => {
  it("strips destination words and filler; a single leftover generic word is kept (not force-emptied) but still collapses two rewordings to the SAME token set", () => {
    const dest = svc.wordsOf("Ameenpur");
    // "view"/"point" are pure filler and get stripped either way; "lake"
    // survives because it's the only token left (the size<=1 guard —
    // see the Agra Fort/Jaipur Museum fix). Both titles land on the
    // identical {lake} set, so finalizeAttractionDedup's specific-token
    // equality check still merges them (verified in the suite below) —
    // just via a different branch than the old zero-token path.
    const a = svc.distinguishingTokens("Ameenpur Lake", dest);
    const b = svc.distinguishingTokens("Ameenpur Lake View Point", dest);
    expect(a.size).toBe(1);
    expect(a.has("lake")).toBe(true);
    expect([...a]).toEqual([...b]);
  });

  it("keeps a real distinguishing word alongside the destination name", () => {
    const dest = svc.wordsOf("Ameenpur");
    const result = svc.distinguishingTokens("Ameenpur Kaman", dest);
    expect(result.has("kaman")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("FIX VERIFIED: 'Agra Fort' keeps 'fort' as its distinguishing token instead of collapsing to zero", () => {
    const dest = svc.wordsOf("Agra");
    const result = svc.distinguishingTokens("Agra Fort", dest);
    expect(result.size).toBe(1);
    expect(result.has("fort")).toBe(true);
  });

  it("FIX VERIFIED: 'Jaipur Museum' keeps 'museum' as its distinguishing token", () => {
    const dest = svc.wordsOf("Jaipur");
    const result = svc.distinguishingTokens("Jaipur Museum", dest);
    expect(result.size).toBe(1);
    expect(result.has("museum")).toBe(true);
  });

  it("still strips a generic feature word when something else survives it", () => {
    const dest = svc.wordsOf("Ameenpur");
    const result = svc.distinguishingTokens("Ameenpur Lake Walking Track", dest);
    expect(result.has("lake")).toBe(false); // stripped — "walking"/"track" carry the signal
    expect(result.has("walking")).toBe(true);
    expect(result.has("track")).toBe(true);
  });

  it("multi-word destination — each word stripped independently", () => {
    const dest = svc.wordsOf("New Delhi");
    const result = svc.distinguishingTokens("New Delhi Metro Station", dest);
    expect(result.has("new")).toBe(false);
    expect(result.has("delhi")).toBe(false);
    expect(result.has("metro")).toBe(true);
    expect(result.has("station")).toBe(true);
  });
});

describe("finalizeAttractionDedup", () => {
  function makePlan(destination: string, activities: Array<{ title: string; type?: string }>) {
    return {
      destination,
      itinerary: [
        {
          day: 1,
          activities: activities.map((a, i) => ({
            ...a,
            time: `${9 + i}:00 AM`,
            type: a.type || "sightseeing",
          })),
        },
      ],
    };
  }

  it("leaves a single activity unchanged", () => {
    const plan = makePlan("Ameenpur", [{ title: "Ameenpur Lake" }]);
    const result = svc.finalizeAttractionDedup(plan);
    expect(result.itinerary[0].activities[0].title).toBe("Ameenpur Lake");
  });

  it("rewrites a genuine cosmetic duplicate to 'Relax / free time at ...'", () => {
    const plan = makePlan("Ameenpur", [
      { title: "Ameenpur Lake" },
      { title: "Ameenpur Lake View Point" },
    ]);
    const result = svc.finalizeAttractionDedup(plan);
    const [a1, a2] = result.itinerary[0].activities;
    expect(a1.title).toBe("Ameenpur Lake");
    expect(a2.title).toMatch(/^Relax \/ free time at /);
    expect(a2.title).toContain("Ameenpur Lake");
  });

  it("leaves food/restaurant activities completely untouched", () => {
    const plan = makePlan("Ameenpur", [
      { title: "Ameenpur Lake" },
      { title: "Ameenpur Lake Biryani House", type: "restaurant" },
    ]);
    const result = svc.finalizeAttractionDedup(plan);
    expect(result.itinerary[0].activities[1].title).toBe("Ameenpur Lake Biryani House");
  });

  it("detects a literal verbatim repeat of a specific real name", () => {
    const plan = makePlan("Hyderabad", [{ title: "Golconda Fort" }, { title: "Golconda Fort" }]);
    const result = svc.finalizeAttractionDedup(plan);
    expect(result.itinerary[0].activities[0].title).toBe("Golconda Fort");
    expect(result.itinerary[0].activities[1].title).toMatch(/Relax \/ free time/);
  });

  it("FIX VERIFIED: 'National Museum' and 'National War Memorial' stay distinct (were false-merged via Math.min)", () => {
    const plan = makePlan("Delhi", [
      { title: "National War Memorial" },
      { title: "National Museum" },
    ]);
    const result = svc.finalizeAttractionDedup(plan);
    const [a1, a2] = result.itinerary[0].activities;
    expect(a1.title).toBe("National War Memorial");
    expect(a2.title).toBe("National Museum");
  });

  it("FIX VERIFIED: 'Red Fort' and 'Red Sand Dunes' stay distinct (shared only the word 'red')", () => {
    const plan = makePlan("Jaisalmer", [{ title: "Red Fort" }, { title: "Red Sand Dunes" }]);
    const result = svc.finalizeAttractionDedup(plan);
    expect(result.itinerary[0].activities[0].title).toBe("Red Fort");
    expect(result.itinerary[0].activities[1].title).toBe("Red Sand Dunes");
  });

  it("preserves a place whose only distinguishing word differs, even sharing the destination prefix", () => {
    const plan = makePlan("Ameenpur", [{ title: "Ameenpur Lake" }, { title: "Ameenpur Kaman" }]);
    const result = svc.finalizeAttractionDedup(plan);
    expect(result.itinerary[0].activities[1].title).toBe("Ameenpur Kaman");
  });

  it("FIX VERIFIED: 'Agra Fort' and 'Jaipur Museum' style titles (destination + one generic word) are no longer force-merged with each other or with an unrelated generic entry", () => {
    const plan = makePlan("India", [
      { title: "Some Generic Viewpoint" }, // reduces to 0 tokens -> firstGenericTitle
      { title: "Agra Fort" }, // used to also reduce to 0 tokens and get merged
    ]);
    const result = svc.finalizeAttractionDedup(plan);
    expect(result.itinerary[0].activities[1].title).toBe("Agra Fort");
  });

  it("real battery: four distinct real Jaipur/Agra/Mumbai landmarks all survive a single itinerary untouched", () => {
    const plan = makePlan("India", [
      { title: "Hawa Mahal" },
      { title: "City Palace" },
      { title: "Taj Mahal" },
      { title: "Gateway of India" },
    ]);
    const result = svc.finalizeAttractionDedup(plan);
    const titles = result.itinerary[0].activities.map((a: { title: string }) => a.title);
    expect(titles).toEqual(["Hawa Mahal", "City Palace", "Taj Mahal", "Gateway of India"]);
  });

  it("returns the plan unchanged when itinerary is missing or not an array", () => {
    const plan = { destination: "Goa", itinerary: null };
    const result = svc.finalizeAttractionDedup(plan);
    expect(result.itinerary).toBeNull();
  });

  it("every rewritten activity ends up with a non-empty title", () => {
    const plan = makePlan("Ameenpur", [
      { title: "Ameenpur Lake" },
      { title: "Ameenpur Lake View Point" },
      { title: "Ameenpur Lake Fishing Area" },
    ]);
    const result = svc.finalizeAttractionDedup(plan);
    for (const act of result.itinerary[0].activities) {
      expect(act.title.length).toBeGreaterThan(0);
    }
  });
});

describe("distinguishingTokens / finalizeAttractionDedup — real-world pair battery", () => {
  const cases: Array<{
    dest: string;
    a: string;
    b: string;
    expectMerge: boolean;
    note: string;
  }> = [
    {
      dest: "Ameenpur",
      a: "Ameenpur Lake",
      b: "Ameenpur Lake View Point",
      expectMerge: true,
      note: "viewpoint reword of same lake",
    },
    {
      dest: "Hyderabad",
      a: "Golconda Fort",
      b: "Golconda Fort",
      expectMerge: true,
      note: "verbatim repeat",
    },
    {
      dest: "Delhi",
      a: "National Museum",
      b: "National War Memorial",
      expectMerge: false,
      note: "fixed false-positive — shared 'national' only",
    },
    {
      dest: "Jaisalmer",
      a: "Red Fort",
      b: "Red Sand Dunes",
      expectMerge: false,
      note: "fixed false-positive — shared 'red' only",
    },
    {
      dest: "Ameenpur",
      a: "Ameenpur Lake",
      b: "Ameenpur Kaman",
      expectMerge: false,
      note: "different real places sharing destination prefix",
    },
    {
      dest: "Delhi",
      a: "Qutub Minar",
      b: "Qutub Complex",
      expectMerge: false,
      note: "related but distinct real sites",
    },
    {
      dest: "Agra",
      a: "Taj Mahal",
      b: "Agra Fort",
      expectMerge: false,
      note: "two famous but different Agra monuments",
    },
    {
      dest: "Jaipur",
      a: "Hawa Mahal",
      b: "City Palace",
      expectMerge: false,
      note: "distinct Jaipur landmarks",
    },
    {
      dest: "Mumbai",
      a: "Gateway of India",
      b: "Marine Drive",
      expectMerge: false,
      note: "distinct Mumbai landmarks, no shared tokens",
    },
  ];

  for (const tc of cases) {
    it(`[${tc.expectMerge ? "should merge" : "must NOT merge"}] dest="${tc.dest}": "${tc.a}" vs "${tc.b}" — ${tc.note}`, () => {
      const plan = {
        destination: tc.dest,
        itinerary: [
          {
            day: 1,
            activities: [
              { title: tc.a, type: "sightseeing", time: "09:00 AM" },
              { title: tc.b, type: "sightseeing", time: "11:00 AM" },
            ],
          },
        ],
      };
      const result = svc.finalizeAttractionDedup(plan);
      const secondTitle = result.itinerary[0].activities[1].title;
      const wasMerged = /^Relax \/ free time at/.test(secondTitle);
      expect(wasMerged).toBe(tc.expectMerge);
    });
  }
});
