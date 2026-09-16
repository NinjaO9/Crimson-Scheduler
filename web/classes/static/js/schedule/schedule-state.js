import { REQUIRED_COURSE_FIELDS, SCHEDULE_STORAGE_KEY } from "./constants.js";

let currentSchedule = [];

export function persistSchedule(scheduleData) {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(scheduleData));
    return true;
  } catch (error) {
    return false;
  }
}

export function isValidCourseEntry(item) {
  return !!item && REQUIRED_COURSE_FIELDS.every((field) => item[field]);
}
export function parseStoredSchedule(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.filter(isValidCourseEntry) : [];
  } catch (error) {
    return [];
  }
}
export function loadSchedule() {
  try {
    const storedSchedule = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (storedSchedule !== null) return parseStoredSchedule(storedSchedule);
  } catch (error) {
    console.warn("Unable to read saved schedule from local storage:", error);
  }
  return [];
}
export function initializeScheduleState() {
  currentSchedule = loadSchedule();
  return currentSchedule;
}

export function getSchedule() {
  return currentSchedule;
}

export function replaceSchedule(scheduleData) {
  currentSchedule = scheduleData;
  persistSchedule(currentSchedule);
  return currentSchedule;
}
export function appendScheduleEntries(entries) {
  const additions = entries.filter(
    (entry) =>
      !currentSchedule.some(
        (item) => String(item.section_id) === String(entry.section_id),
      ),
  );
  if (additions.length) replaceSchedule([...currentSchedule, ...additions]);
  return additions;
}
export function removeScheduleEntry(sectionId) {
  const matchedEntry = currentSchedule.find(
    (entry) => String(entry.section_id) === String(sectionId),
  );
  if (!matchedEntry) return false;
  const scheduleGroupId = matchedEntry.schedule_group_id;
  currentSchedule = currentSchedule.filter((entry) => {
    if (scheduleGroupId) return entry.schedule_group_id !== scheduleGroupId;
    return String(entry.section_id) !== String(sectionId);
  });
  persistSchedule(currentSchedule);
  return true;
}
export function clearSchedule() {
  return replaceSchedule([]);
}
export function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split(";") : [];
  const prefix = `${name}=`;
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    if (cookie.startsWith(prefix))
      return decodeURIComponent(cookie.substring(prefix.length));
  }
  return "";
}
