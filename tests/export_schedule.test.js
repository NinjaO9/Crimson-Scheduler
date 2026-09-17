import { describe, expect, it } from "vitest";
import {
  generateCalendar,
  getDateEnvelope,
  getTermYear,
  parseMonthDay,
  safeFilename,
} from "../web/classes/static/js/schedule/export-schedule.js";

const timedEntry = (overrides = {}) => ({
  section_id: "123",
  term_slug: "fall-2026",
  course_code: "CPT_S 121",
  instructor: "A. Instructor",
  location: "Todd 101",
  days: "MWF",
  time: "9:00 AM - 9:50 AM",
  dates: { start: "Aug 24", end: "Dec 11" },
  ...overrides,
});

describe("calendar export", () => {
  it("parses term years and month/day values", () => {
    expect(getTermYear("fall-2026")).toBe(2026);
    expect(parseMonthDay("Aug 24", 2026)).toEqual(new Date(2026, 7, 24));
  });

  it("uses source dates and term fallback envelopes", () => {
    expect(getDateEnvelope(timedEntry())).toEqual({
      start: new Date(2026, 7, 24),
      end: new Date(2026, 11, 11, 23, 59, 59),
    });
    expect(getDateEnvelope(timedEntry({ dates: { start: "", end: "" } }))).toEqual({
      start: new Date(2026, 7, 1),
      end: new Date(2026, 11, 31, 23, 59, 59),
    });
  });

  it("creates one recurring event per meeting group", () => {
    const { calendar, eventCount } = generateCalendar("Fall Schedule", [timedEntry({
      days: "MWF,T",
      time: "9:00 AM - 9:50 AM;1:00 PM - 2:15 PM",
    })]);
    const ics = calendar.toString();
    expect(eventCount).toBe(2);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:CPT_S 121");
    expect(ics).toContain("DESCRIPTION:A. Instructor");
    expect(ics).toContain("LOCATION:Todd 101");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20261211T");
    expect(ics).toContain("BYDAY=MO,WE,FR");
    expect(ics).toContain("BYDAY=TU");
  });

  it("silently omits unscheduled sections", () => {
    const { calendar, eventCount } = generateCalendar("Fall Schedule", [
      timedEntry({ days: "ARR", time: "ARR" }),
      timedEntry({ section_id: "456", term_slug: "unknown-2026", dates: { start: "", end: "" } }),
    ]);
    expect(eventCount).toBe(0);
    expect(calendar.toString()).not.toContain("BEGIN:VEVENT");
  });

  it("creates safe download names", () => {
    expect(safeFilename("Fall 2026 / My Schedule!")).toBe("Fall-2026-My-Schedule");
    expect(safeFilename("   ")).toBe("schedule");
  });
});
