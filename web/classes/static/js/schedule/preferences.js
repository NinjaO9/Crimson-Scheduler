import {
  DEFAULT_SCHEDULE_NAME,
  HIDE_WEEKENDS_STORAGE_KEY,
  SCHEDULE_NAME_MAX_LENGTH,
  SCHEDULE_NAME_STORAGE_KEY,
  SHOW_COURSE_SECTION_STORAGE_KEY,
  SHOW_INSTRUCTORS_STORAGE_KEY,
  TIME_FORMAT_STORAGE_KEY,
} from "./constants.js";

export function uses24HourTime() {
  const toggle = document.getElementById("timeFormatToggle");
  return !!toggle && toggle.checked;
}

export function hidesWeekends() {
  const toggle = document.getElementById("hideWeekendsToggle");
  return !!toggle && toggle.checked;
}

export function showInstructors() {
  const toggle = document.getElementById("showInstructorToggle");
  return !!toggle && toggle.checked;
}

export function showSections() {
  const toggle = document.getElementById("showSectionToggle");
  return !!toggle && toggle.checked;
}

export function initializeScheduleOptions() {
  const timeToggle = document.getElementById("timeFormatToggle");
  if (timeToggle)
    timeToggle.checked =
      localStorage.getItem(TIME_FORMAT_STORAGE_KEY) === "true";
  const weekendToggle = document.getElementById("hideWeekendsToggle");
  if (weekendToggle)
    weekendToggle.checked =
      localStorage.getItem(HIDE_WEEKENDS_STORAGE_KEY) === "true";
  const instructorToggle = document.getElementById("showInstructorToggle");
  if (instructorToggle)
    instructorToggle.checked =
      localStorage.getItem(SHOW_INSTRUCTORS_STORAGE_KEY) === "true";
  const sectionToggle = document.getElementById("showSectionToggle");
  if (sectionToggle)
    sectionToggle.checked =
      localStorage.getItem(SHOW_COURSE_SECTION_STORAGE_KEY) !== "false";
}

export function saveScheduleOptions() {
  localStorage.setItem(TIME_FORMAT_STORAGE_KEY, String(uses24HourTime()));
  localStorage.setItem(HIDE_WEEKENDS_STORAGE_KEY, String(hidesWeekends()));
  localStorage.setItem(SHOW_INSTRUCTORS_STORAGE_KEY, String(showInstructors()));
  localStorage.setItem(SHOW_COURSE_SECTION_STORAGE_KEY, String(showSections()));
}

export function initializeScheduleName() {
  const input = document.getElementById("scheduleNameInput");
  if (!input) return;
  input.value = getStoredScheduleName();
  resizeScheduleNameInput();
}

export function getScheduleName() {
  const input = document.getElementById("scheduleNameInput");
  const name = input ? input.value.trim() : "";
  return (name || DEFAULT_SCHEDULE_NAME).slice(0, SCHEDULE_NAME_MAX_LENGTH);
}

export function getStoredScheduleName() {
  return (
    (
      localStorage.getItem(SCHEDULE_NAME_STORAGE_KEY) || DEFAULT_SCHEDULE_NAME
    ).trim() || DEFAULT_SCHEDULE_NAME
  ).slice(0, SCHEDULE_NAME_MAX_LENGTH);
}

export function saveScheduleName() {
  localStorage.setItem(SCHEDULE_NAME_STORAGE_KEY, getScheduleName());
  resizeScheduleNameInput();
}

export function normalizeScheduleNameInput() {
  const input = document.getElementById("scheduleNameInput");
  if (!input) return;
  input.value = getScheduleName();
  saveScheduleName();
}

export function resizeScheduleNameInput() {
  const input = document.getElementById("scheduleNameInput");
  if (!input) return;
  const styles = window.getComputedStyle(input);
  const canvas =
    resizeScheduleNameInput.canvas || document.createElement("canvas");
  resizeScheduleNameInput.canvas = canvas;
  const context = canvas.getContext("2d");
  context.font = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
  input.style.width = `${Math.ceil(context.measureText(input.value || DEFAULT_SCHEDULE_NAME).width + 10)}px`;
}

export function slugifyScheduleName(name) {
  const slug = (name || DEFAULT_SCHEDULE_NAME)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "schedule";
}
