import { describe, it, expect } from "vitest";
import { toInputTime, fromInputTime, nextAvailableTime } from "@/lib/time";

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

describe("default time for a new activity", () => {
  it("starts after the day's last activity, ignoring unparseable times", () => {
    expect(
      nextAvailableTime([{ time: "10:00 AM", duration_minutes: 90 }, { time: "Morning" }]),
    ).toBe("11:30 AM");
  });

  it("never wraps past the end of the day", () => {
    expect(nextAvailableTime([{ time: "11:00 PM", duration_minutes: 120 }])).toBe("11:00 PM");
  });
});
