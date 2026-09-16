import { describe, expect, it } from "vitest";
import {
  parseDaysToIndexes,
  parseTimeRange,
  resolveScheduleGroups,
  timeToMinutes,
} from "../web/classes/static/js/schedule/time-and-meetings.js";

describe("schedule time and meeting parsing", () => {
  it("parses 12-hour, 24-hour, and compact time values", () => {
    expect(timeToMinutes("12:30 AM")).toBe(30);
    expect(timeToMinutes("1:15 PM")).toBe(795);
    expect(timeToMinutes("13:45")).toBe(825);
    expect(timeToMinutes("930")).toBe(570);
  });

  it("rejects invalid or reversed meeting ranges", () => {
    expect(parseTimeRange("ARR")).toBeNull();
    expect(parseTimeRange("2:00 PM - 1:00 PM")).toBeNull();
    expect(parseTimeRange("9:00 - 10:15 AM")).toEqual({ start: 540, end: 615 });
  });

  it("normalizes abbreviated and full day names", () => {
    expect(parseDaysToIndexes("Monday, Wednesday / Friday")).toEqual([0, 2, 4]);
    expect(parseDaysToIndexes("ARR")).toEqual([]);
  });

  it("keeps paired day and time lists separate", () => {
    expect(
      resolveScheduleGroups({
        days: "MWF,T",
        time: "9:00 AM - 9:50 AM;1:00 PM - 2:15 PM",
      }),
    ).toEqual([
      { dayIndexes: [0, 2, 4], timeRange: { start: 540, end: 590 } },
      { dayIndexes: [1], timeRange: { start: 780, end: 855 } },
    ]);
  });
});
