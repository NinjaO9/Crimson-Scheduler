/**
 * @fileoverview Test cases for the parsing time and meetings from course data. Ensures that this behaves as expected.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { describe, expect, it } from "vitest";
import {
  parseDaysToIndexes,
  parseTimeRange,
  formatTimeRangeForDisplay,
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

  it("keeps explicit meeting records separate", () => {
    const meetings = [
      { days: "MWF", time: "9:00 AM - 9:50 AM" },
      { days: "T", time: "1:00 PM - 2:15 PM" },
    ];
    expect(resolveScheduleGroups(meetings)).toMatchObject([
      { dayIndexes: [0, 2, 4], timeRange: { start: 540, end: 590 } },
      { dayIndexes: [1], timeRange: { start: 780, end: 855 } },
    ]);
  });

  it("omits arranged and malformed meeting records from the calendar", () => {
    expect(resolveScheduleGroups([
      { days: "ARR", time: "ARR" },
      { days: "M", time: "3:00 PM - 2:00 PM" },
    ])).toEqual([]);
  });

  it("formats individual meeting ranges in the selected clock format", () => {
    document.body.innerHTML = '<input id="timeFormatToggle" type="checkbox">';
    expect(formatTimeRangeForDisplay("14:10 - 15:00")).toBe("2:10 PM - 3:00 PM");
    document.getElementById("timeFormatToggle").checked = true;
    expect(formatTimeRangeForDisplay("14:10 - 15:00")).toBe("14:10 - 15:00");
  });
});
