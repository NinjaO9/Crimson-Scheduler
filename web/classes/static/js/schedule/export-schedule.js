import ical, { ICalCalendarMethod } from "ical-generator";
import { resolveScheduleGroups } from "./time-and-meetings.js";

const ICAL_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const TIMEZONE = "America/Los_Angeles";

export function initializeCalendarExport({
  getScheduleName,
  normalizeScheduleName,
  getSchedule,
}) {
  return function exportCalendar() {
    normalizeScheduleName();
    const name = getScheduleName();
    const result = generateCalendar(name, getSchedule());
    if (result.eventCount) downloadCalendar(result.calendar.toString(), name);
  };
}

export function createCalendar(name) {
  const calendar = ical({
    name: name || "Crimson Scheduler",
    prodId: "//Crimson Scheduler//Schedule Export//EN",
    timezone: TIMEZONE,
  });
  calendar.method(ICalCalendarMethod.PUBLISH);
  return calendar;
}

export function generateCalendar(name, schedule) {
  const calendar = createCalendar(name);
  const eventCount = (schedule || []).reduce(
    (count, courseData) => count + addCourseEvents(calendar, courseData),
    0,
  );
  return { calendar, eventCount };
}

function addCourseEvents(calendar, courseData) {
  const dates = getDateEnvelope(courseData);
  if (!dates) return 0;
  let count = 0;
  resolveScheduleGroups(courseData).forEach(({ dayIndexes, timeRange }) => {
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
        freq: "WEEKLY",
        byDay: dayIndexes.map((index) => ICAL_DAYS[index]),
        until: dates.end,
      },
    });
    count += 1;
  });
  return count;
}

export function getTermYear(termSlug) {
  const match = String(termSlug || "").match(/(?:^|-)((?:19|20)\d{2})(?:-|$)/);
  return match ? Number(match[1]) : null;
}

export function parseMonthDay(value, year) {
  const match = String(value || "").trim().match(/^([A-Za-z]{3,9})\s+(\d{1,2})$/);
  if (!match) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(match[1].slice(0, 3).toLowerCase());
  const day = Number(match[2]);
  const date = new Date(year, month, day);
  return month >= 0 && date.getMonth() === month && date.getDate() === day ? date : null;
}

export function getDateEnvelope(courseData) {
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

function firstDateForWeekday(start, dayIndex) {
  const date = new Date(start);
  const mondayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() + (dayIndex - mondayIndex + 7) % 7);
  return date;
}

function withMinutes(date, minutes) {
  const result = new Date(date);
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
}

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 0);
  return result;
}

function downloadCalendar(contents, scheduleName) {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(scheduleName)}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(value) {
  return String(value || "schedule")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "schedule";
}
