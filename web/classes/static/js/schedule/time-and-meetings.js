/**
 * @fileoverview Parses and formats course meeting times for schedule display.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { DAY_TOKEN_MAP, DAYS_OF_WEEK } from "./constants.js";
import { uses24HourTime } from "./preferences.js";

/**
 * Formats one meeting-time token using the active 12/24-hour preference.
 *
 * @param {string} token - Time token to normalize and display.
 * @returns {string} Formatted time, or the original token when unparsable.
 * @see {@link timeToMinutes}
 * @see {@link formatMinutesAs12Hour}
 */
export function formatTimeTokenForDisplay(token) {
  const normalized = (token || "").trim();
  const minutes = timeToMinutes(normalized);
  if (minutes === null) return normalized;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return uses24HourTime()
    ? `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
    : formatMinutesAs12Hour(minutes);
}

/**
 * Converts minutes after midnight into a 12-hour clock label.
 *
 * @param {number} minutes - Minutes after midnight.
 * @returns {string} Time label with an AM/PM suffix.
 */
export function formatMinutesAs12Hour(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

/**
 * Formats a meeting range while preserving arranged or unavailable markers.
 *
 * @param {string} timeRange - Range such as `09:00-10:00`.
 * @returns {string} Display-ready range.
 * @see {@link formatTimeTokenForDisplay}
 */
export function formatTimeRangeForDisplay(timeRange) {
  const normalized = (timeRange || "").trim();
  if (!normalized || normalized === "ARR" || normalized === "N/A")
    return normalized;
  const parts = normalized.split(/\s*-\s*/);
  if (parts.length !== 2) return formatTimeTokenForDisplay(normalized);
  return `${formatTimeTokenForDisplay(parts[0])} - ${formatTimeTokenForDisplay(parts[1])}`;
}

/**
 * Formats meeting records while retaining each days/time association.
 *
 * @param {{days: string, time: string}[]} meetings - Explicit meeting records.
 * @returns {string} Display-ready meeting list with one meeting per line.
 * @see {@link formatTimeRangeForDisplay}
 */
export function formatMeetingsForDisplay(meetings) {
  if (!Array.isArray(meetings) || !meetings.length) return "Meetings unavailable";
  return meetings
    .map((meeting) => {
      const days = String(meeting && meeting.days || "").trim();
      const time = formatTimeRangeForDisplay(String(meeting && meeting.time || "").trim());
      return [days, time].filter(Boolean).join(" | ");
    })
    .filter(Boolean)
    .join("\n") || "Meetings unavailable";
}

/**
 * Formats an integer hour for the schedule grid's axis label.
 *
 * @param {number} hour - Hour in 24-hour notation.
 * @returns {string} Twelve-hour label with AM/PM.
 */
export function formatHourLabel(hour) {
  return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

/**
 * Parses common 12-hour, 24-hour, compact, and bare-hour time formats.
 *
 * @param {string} timeStr - Time text to parse.
 * @returns {number|null} Minutes after midnight, or `null` if invalid.
 */
export function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const normalized = timeStr.trim();
  const match12hr = normalized.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (match12hr) {
    let hours = parseInt(match12hr[1], 10);
    const minutes = match12hr[2] ? parseInt(match12hr[2], 10) : 0;
    const period = match12hr[3].toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const match24hr = normalized.match(/(\d+)[.:](\d+)/);
  if (match24hr)
    return parseInt(match24hr[1], 10) * 60 + parseInt(match24hr[2], 10);
  const matchCompact = normalized.match(/^(\d{3,4})$/);
  if (matchCompact) {
    const padded =
      matchCompact[1].length === 3 ? `0${matchCompact[1]}` : matchCompact[1];
    return (
      parseInt(padded.slice(0, 2), 10) * 60 + parseInt(padded.slice(2, 4), 10)
    );
  }
  const matchBareHour = normalized.match(/^(\d{1,2})$/);
  return matchBareHour ? parseInt(matchBareHour[1], 10) * 60 : null;
}

/**
 * Parses a start/end time range and propagates a lone AM/PM marker to its pair.
 *
 * @param {string} timeStr - Range text using a hyphen or the word `to`.
 * @returns {{start: number, end: number}|null} Minute range, or `null` if invalid.
 * @see {@link timeToMinutes}
 */
export function parseTimeRange(timeStr) {
  if (!timeStr || timeStr === "N/A") return null;
  const normalizedStr = timeStr
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\bto\b/gi, "-");
  let parts = normalizedStr.split(/\s*-\s*/);
  if (parts.length !== 2) {
    const matchedTimes = normalizedStr.match(
      /\d{1,2}(?::\d{2})?\s*(?:AM|PM)|\b\d{3,4}\b/gi,
    );
    if (!matchedTimes || matchedTimes.length < 2) return null;
    parts = [matchedTimes[0], matchedTimes[1]];
  }
  let startPart = parts[0].trim();
  let endPart = parts[1].trim();
  const startHasMeridiem = /(AM|PM)/i.test(startPart);
  const endHasMeridiem = /(AM|PM)/i.test(endPart);
  if (!startHasMeridiem && endHasMeridiem)
    startPart = `${startPart} ${(endPart.match(/(AM|PM)/i) || [""])[0]}`;
  if (startHasMeridiem && !endHasMeridiem)
    endPart = `${endPart} ${(startPart.match(/(AM|PM)/i) || [""])[0]}`;
  const start = timeToMinutes(startPart);
  const end = timeToMinutes(endPart);
  return start === null || end === null || end <= start ? null : { start, end };
}

/**
 * Converts day abbreviations into unique Monday-based weekday indexes.
 *
 * @param {string} daysStr - Day text such as `MWF` or `Tue/Thu`.
 * @returns {number[]} Weekday indexes in first-seen order.
 */
export function parseDaysToIndexes(daysStr) {
  if (!daysStr) return [];
  const upper = daysStr.toUpperCase().trim();
  if (
    !upper ||
    upper === "N/A" ||
    upper.includes("TBA") ||
    upper.includes("ARR")
  )
    return [];
  let normalized = upper.replace(/\s/g, "");
  DAY_TOKEN_MAP.forEach(([pattern, letter]) => {
    normalized = normalized.replace(pattern, letter);
  });
  normalized = normalized.replace(/[^MTWRFSU,/-]/g, "");
  const indexes = [];
  normalized
    .replace(/[,/-]/g, "")
    .split("")
    .forEach((dayChar) => {
      const dayIndex = DAYS_OF_WEEK.findIndex((day) => day.key === dayChar);
      if (dayIndex !== -1 && !indexes.includes(dayIndex))
        indexes.push(dayIndex);
    });
  return indexes;
}

/**
 * Resolves explicit meeting records into calendar-ready groups.
 *
 * @param {{days: string, time: string}[]} meetings - Explicit meeting records.
 * @returns {{dayIndexes: number[], timeRange: {start: number, end: number}, meeting: Object}[]}
 *   Resolved groups, or an empty array when the meeting cannot be parsed.
 * @see {@link parseDaysToIndexes}
 * @see {@link parseTimeRange}
 */
export function resolveScheduleGroups(meetings) {
  if (!Array.isArray(meetings)) return [];
  return meetings.reduce((groups, meeting) => {
    const dayIndexes = parseDaysToIndexes(meeting && meeting.days);
    const timeRange = parseTimeRange(meeting && meeting.time);
    if (dayIndexes.length && timeRange) groups.push({ dayIndexes, timeRange, meeting });
    return groups;
  }, []);
}
