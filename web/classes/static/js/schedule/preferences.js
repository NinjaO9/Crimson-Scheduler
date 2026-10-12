/**
 * @fileoverview Reads and persists schedule display preferences in local storage.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import {
  DEFAULT_SCHEDULE_NAME,
  HIDE_WEEKENDS_STORAGE_KEY,
  SCHEDULE_NAME_MAX_LENGTH,
  SHOW_COURSE_SECTION_STORAGE_KEY,
  SHOW_INSTRUCTORS_STORAGE_KEY,
  TIME_FORMAT_STORAGE_KEY,
} from "./constants.js";
import {
  getActiveSchedule,
  updateScheduleWorkspaceName,
} from "./schedule-state.js";

/**
 * Alerts if user is using 24 hour timing or not.
 *
 * @returns {boolean} `true` if the user is using 24-hour time, `false` otherwise.
 */
export function uses24HourTime() {
  const toggle = document.getElementById("timeFormatToggle");
  return !!toggle && toggle.checked;
}

/**
 * Alerts if user is hiding weekends.
 *
 * @returns {boolean} `true` if the user is hiding weekends, `false` otherwise.
 */
export function hidesWeekends() {
  const toggle = document.getElementById("hideWeekendsToggle");
  return !!toggle && toggle.checked;
}

/**
 * Alerts if the user is showing instructors or not.
 *
 * @returns {boolean} `true` if the user is showing instructors, `false` otherwise.
 */
export function showInstructors() {
  const toggle = document.getElementById("showInstructorToggle");
  return !!toggle && toggle.checked;
}

/**
 * Alerts if the user is showing section numbers.
 *
 * @returns {boolean} `true` if the user has the option toggled, `false` otherwise.
 */
export function showSections() {
  const toggle = document.getElementById("showSectionToggle");
  return !!toggle && toggle.checked;
}

/**
 * Initializes the options based on saved preferences in local storage.
 *
 * @returns {void}
 */
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

/**
 * Saves current schedule options in local storage for persistence.
 *
 * @returns {void}
 */
export function saveScheduleOptions() {
  localStorage.setItem(TIME_FORMAT_STORAGE_KEY, String(uses24HourTime()));
  localStorage.setItem(HIDE_WEEKENDS_STORAGE_KEY, String(hidesWeekends()));
  localStorage.setItem(SHOW_INSTRUCTORS_STORAGE_KEY, String(showInstructors()));
  localStorage.setItem(SHOW_COURSE_SECTION_STORAGE_KEY, String(showSections()));
}

/**
 * Grabs schedule name from local storage and sets the current schedule to such.
 *
 * @returns {void}
 */
export function initializeScheduleName() {
  const input = document.getElementById("scheduleNameInput");
  if (!input) return;
  input.value = getStoredScheduleName();
  resizeScheduleNameInput();
}

/**
 * Grabs the currently active schedule name.
 *
 * @returns {string} Active schedule name.
 */
export function getScheduleName() {
  const input = document.getElementById("scheduleNameInput");
  const name = input ? input.value.trim() : "";
  return (name || DEFAULT_SCHEDULE_NAME).slice(0, SCHEDULE_NAME_MAX_LENGTH);
}

/**
 * Grabs the saveed schedule name from local storage, if it exists. Default name otherwise.
 *
 * @returns {string} Saved schedule name.
 */
export function getStoredScheduleName() {
  const schedule = getActiveSchedule();
  return (schedule && schedule.name
    ? String(schedule.name)
    : DEFAULT_SCHEDULE_NAME
  ).trim().slice(0, SCHEDULE_NAME_MAX_LENGTH);
}

/**
 * Saves the current schedule name into the active workspace.
 *
 * @returns {*} Result produced by saveScheduleName.
 * @see {@link schedule-state.updateScheduleWorkspaceName}
 */
export function saveScheduleName() {
  const name = getScheduleName();
  updateScheduleWorkspaceName(name);
  resizeScheduleNameInput();
}

/**
 * .Updates the input value of the schedule name.
 *
 * @returns {void}
 */
export function normalizeScheduleNameInput() {
  const input = document.getElementById("scheduleNameInput");
  if (!input) return;
  input.value = getScheduleName();
  saveScheduleName();
}

/**
 * Resizes the schedule name input box based on size.
 *
 * @returns {void}
 */
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

/**
 * Slugifies the schedule name.
 *
 * @param {string} name - Name to slugify.
 * @returns {string} Slugified name.
 */
export function slugifyScheduleName(name) {
  const slug = (name || DEFAULT_SCHEDULE_NAME)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "schedule";
}
