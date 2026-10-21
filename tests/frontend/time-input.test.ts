import { describe, it, expect } from "vitest";
import { toInputTime, fromInputTime } from "@/lib/time";

// <input type="time"> needs 24h "HH:MM"; activities store "hh:mm AM/PM".
describe("time input conversion", () => {
  it("shows stored 12h times in the 24h input", () => {
    expect(toInputTime("09:00 AM")).toBe("09:00");
    expect(toInputTime("08:44 PM")).toBe("20:44");
    expect(toInputTime("12:15 AM")).toBe("00:15");
    expect(toInputTime("12:30 PM")).toBe("12:30");
    expect(toInputTime("")).toBe("");
  });

  it("stores what the input returns in the app's 12h format", () => {
    expect(fromInputTime("20:44")).toBe("08:44 PM");
    expect(fromInputTime("00:15")).toBe("12:15 AM");
    expect(fromInputTime("")).toBe("");
  });

  it("round-trips", () => {
    for (const t of ["06:05 AM", "11:59 PM", "12:00 PM"])
      expect(fromInputTime(toInputTime(t))).toBe(t);
  });
});
