import { DAY_TOKEN_MAP, DAYS_OF_WEEK } from "./constants.js";
import { uses24HourTime } from "./preferences.js";

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

export function formatMinutesAs12Hour(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function formatTimeRangeForDisplay(timeRange) {
  const normalized = (timeRange || "").trim();
  if (!normalized || normalized === "ARR" || normalized === "N/A")
    return normalized;
  const parts = normalized.split(/\s*-\s*/);
  if (parts.length !== 2) return formatTimeTokenForDisplay(normalized);
  return `${formatTimeTokenForDisplay(parts[0])} - ${formatTimeTokenForDisplay(parts[1])}`;
}

export function formatMeetingListForDisplay(timeValue) {
  return (timeValue || "").split(";").map(formatTimeRangeForDisplay).join(";");
}

export function formatHourLabel(hour) {
  return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

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

export function tryParsePairedDayTimeLists(courseData) {
  const rawDayTokens = (courseData.days || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rawTimeTokens = (courseData.time || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !(
      rawDayTokens.length > 1 &&
      rawTimeTokens.length > 1 &&
      rawDayTokens.length === rawTimeTokens.length
    )
  )
    return null;
  const pairs = [];
  for (let i = 0; i < rawDayTokens.length; i++) {
    const dayIndexes = parseDaysToIndexes(rawDayTokens[i]);
    const timeRange = parseTimeRange(rawTimeTokens[i]);
    if (!dayIndexes.length || !timeRange) return null;
    pairs.push({ dayIndexes, timeRange });
  }
  return pairs;
}

export function resolveScheduleGroups(courseData) {
  const pairedGroups = tryParsePairedDayTimeLists(courseData);
  if (pairedGroups) return pairedGroups;
  let dayIndexes = parseDaysToIndexes(courseData.days);
  let timeRange = parseTimeRange(courseData.time);
  if (!dayIndexes.length || !timeRange) {
    const swappedDayIndexes = parseDaysToIndexes(courseData.time);
    const swappedTimeRange = parseTimeRange(courseData.days);
    if (swappedDayIndexes.length && swappedTimeRange) {
      dayIndexes = swappedDayIndexes;
      timeRange = swappedTimeRange;
    }
  }
  return !dayIndexes.length || !timeRange ? [] : [{ dayIndexes, timeRange }];
}
