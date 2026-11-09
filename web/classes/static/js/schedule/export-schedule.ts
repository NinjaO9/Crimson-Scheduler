/**
 * @fileoverview Exports the active schedule as an iCalendar file.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import ical, { ICalCalendarMethod, ICalEventRepeatingFreq, ICalWeekday } from "ical-generator";
import { resolveScheduleGroups } from "./time-and-meetings.js";
import type { HydratedSection } from "../types.js";

type Calendar = ReturnType<typeof ical>;

const ICAL_DAYS = [ICalWeekday.MO, ICalWeekday.TU, ICalWeekday.WE, ICalWeekday.TH, ICalWeekday.FR, ICalWeekday.SA, ICalWeekday.SU];
const TIMEZONE = "America/Los_Angeles";

export function initializeCalendarExport({
  getScheduleName,
  normalizeScheduleName,
  getSchedule,
}: {
  getScheduleName: () => string;
  normalizeScheduleName: () => void;
  getSchedule: () => HydratedSection[];
}): () => void {
  /**
   * Normalizes the schedule name and downloads the generated calendar when events exist.
   *
   * @see {@link generateCalendar}
   */
  return function exportCalendar(): void {
    normalizeScheduleName();
    const name = getScheduleName();
    const result = generateCalendar(name, getSchedule());
    if (result.eventCount) downloadCalendar(result.calendar.toString(), name);
  };
}

/**
 * Creates a publishing iCalendar document configured for the schedule timezone.
 *
 * @param name - Calendar display name.
 * @returns iCalendar generator instance.
 */
export function createCalendar(name: string): Calendar {
  const calendar = ical({
    name: name || "Crimson Scheduler",
    prodId: "//Crimson Scheduler//Schedule Export//EN",
    timezone: TIMEZONE,
  });
  calendar.method(ICalCalendarMethod.PUBLISH);
  return calendar;
}

/**
 * Converts schedule entries into recurring calendar events.
 * Delegates each course entry to {@link addCourseEvents}.
 *
 * @param name - Calendar display name.
 * @param schedule - Schedule section records to export.
 * @returns Calendar and created-event count.
 */
export function generateCalendar(name: string, schedule: HydratedSection[]): { calendar: Calendar; eventCount: number } {
  const calendar = createCalendar(name);
  const eventCount = (schedule || []).reduce(
    (count, courseData) => count + addCourseEvents(calendar, courseData),
    0,
  );
  return { calendar, eventCount };
}

/**
 * Adds one recurring event per resolved meeting pattern for a course section.
 * Uses {@link getDateEnvelope}, {@link firstDateForWeekday}, and {@link withMinutes}
 * to translate term and meeting data into calendar dates.
 *
 * @param calendar - iCalendar generator receiving the events.
 * @param courseData - Course/section record with dates and meetings.
 * @returns Number of events added.
 */
function addCourseEvents(calendar: Calendar, courseData: HydratedSection): number {
  const dates = getDateEnvelope(courseData);
  if (!dates) return 0;
  let count = 0;
  resolveScheduleGroups(courseData.meetings).forEach(({ dayIndexes, timeRange }) => {
    const firstDay = firstDateForWeekday(dates.start, dayIndexes[0]);
    calendar.createEvent({
      id: `${courseData.section_id}-${timeRange.start}-${dayIndexes.join("")}`,
      start: withMinutes(firstDay, timeRange.start),
      end: withMinutes(firstDay, timeRange.end),
      summary: courseData.course_code,
      description: courseData.instructor || "",
      location: courseData.location || "",
      timezone: TIMEZONE,
      repeating: {
        freq: ICalEventRepeatingFreq.WEEKLY,
        byDay: dayIndexes.map((index) => ICAL_DAYS[index]),
        until: dates.end,
      },
    });
    count += 1;
  });
  return count;
}

/**
 * Extracts a four-digit year from a term slug.
 *
 * @param termSlug - Term identifier containing a year.
 * @returns Parsed year, or `null` when absent.
 */
export function getTermYear(termSlug: string | undefined): number | null {
  const match = String(termSlug || "").match(/(?:^|-)((?:19|20)\d{2})(?:-|$)/);
  return match ? Number(match[1]) : null;
}

/**
 * Parses a month-name/day value and validates it against a year.
 *
 * @param value - Date text such as `Aug 24`.
 * @param year - Year used to construct the date.
 * @returns Valid date, or `null` for malformed/impossible input.
 */
export function parseMonthDay(value: string | undefined, year: number): Date | null {
  const match = String(value || "").trim().match(/^([A-Za-z]{3,9})\s+(\d{1,2})$/);
  if (!match) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(match[1].slice(0, 3).toLowerCase());
  const day = Number(match[2]);
  const date = new Date(year, month, day);
  return month >= 0 && date.getMonth() === month && date.getDate() === day ? date : null;
}

/**
 * Determines the start and end dates used for recurring course events.
 * Prefers explicit course dates and falls back to a season-based range.
 *
 * @param courseData - Course record containing `term_slug` and optional dates.
 * @returns Export range, or `null` when unknown.
 * @see {@link getTermYear}
 * @see {@link parseMonthDay}
 */
export function getDateEnvelope(courseData: HydratedSection): { start: Date; end: Date } | null {
  const year = getTermYear(courseData.term_slug);
  if (!year) return null;
  const start = parseMonthDay(courseData.dates && courseData.dates.start, year);
  const end = parseMonthDay(courseData.dates && courseData.dates.end, year);
  if (start && end && end >= start) return { start, end: endOfDay(end) };
  const term = String(courseData.term_slug || "").toLowerCase();
  if (term.includes("spring")) return { start: new Date(year, 0, 1), end: endOfDay(new Date(year, 5, 30)) };
  if (term.includes("summer")) return { start: new Date(year, 4, 1), end: endOfDay(new Date(year, 8, 30)) };
  if (term.includes("fall")) return { start: new Date(year, 7, 1), end: endOfDay(new Date(year, 11, 31)) };
  return null;
}

/**
 * Finds the first occurrence of a Monday-based weekday on or after a start date.
 *
 * @param start - Date at which the search begins.
 * @param dayIndex - Monday-based weekday index from 0 through 6.
 * @returns First matching date.
 */
function firstDateForWeekday(start: Date, dayIndex: number): Date {
  const date = new Date(start);
  const mondayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() + (dayIndex - mondayIndex + 7) % 7);
  return date;
}

/**
 * Copies a date and sets its local clock time from minutes after midnight.
 *
 * @param date - Date whose calendar day is retained.
 * @param minutes - Minutes after midnight.
 * @returns New date with the requested time.
 */
function withMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
}

/**
 * Copies a date and sets its time to 23:59:59.
 *
 * @param date - Date whose calendar day is retained.
 * @returns End-of-day copy.
 */
function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 0);
  return result;
}

/**
 * Creates a temporary calendar blob and starts a browser download.
 *
 * @param contents - Serialized iCalendar contents.
 * @param scheduleName - Name used to build the download filename.
 * @see {@link safeFilename}
 */
function downloadCalendar(contents: string, scheduleName: string): void {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(scheduleName)}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Converts a schedule name into a filesystem-safe `.ics` basename.
 *
 * @param value - Candidate schedule name.
 * @returns Sanitized filename stem, defaulting to `schedule`.
 */
export function safeFilename(value: string): string {
  return String(value || "schedule")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "schedule";
}
