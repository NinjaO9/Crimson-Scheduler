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
export function uses24HourTime(): boolean {
  const toggle = document.querySelector<HTMLInputElement>("#timeFormatToggle");
  return !!toggle && toggle.checked;
}

/**
 * Alerts if user is hiding weekends.
 *
 * @returns {boolean} `true` if the user is hiding weekends, `false` otherwise.
 */
export function hidesWeekends(): boolean {
  const toggle = document.querySelector<HTMLInputElement>("#hideWeekendsToggle");
  return !!toggle && toggle.checked;
}

/**
 * Alerts if the user is showing instructors or not.
 *
 * @returns {boolean} `true` if the user is showing instructors, `false` otherwise.
 */
export function showInstructors(): boolean {
  const toggle = document.querySelector<HTMLInputElement>("#showInstructorToggle");
  return !!toggle && toggle.checked;
}

/**
 * Alerts if the user is showing section numbers.
 *
 * @returns {boolean} `true` if the user has the option toggled, `false` otherwise.
 */
export function showSections(): boolean {
  const toggle = document.querySelector<HTMLInputElement>("#showSectionToggle");
  return !!toggle && toggle.checked;
}

/**
 * Initializes the options based on saved preferences in local storage.
 *
 * @returns {void}
 */
export function initializeScheduleOptions(): void {
  const timeToggle = document.querySelector<HTMLInputElement>("#timeFormatToggle");
  if (timeToggle)
    timeToggle.checked =
      localStorage.getItem(TIME_FORMAT_STORAGE_KEY) === "true";
  const weekendToggle = document.querySelector<HTMLInputElement>("#hideWeekendsToggle");
  if (weekendToggle) {
    const savedWeekendPreference = localStorage.getItem(
      HIDE_WEEKENDS_STORAGE_KEY,
    );
    weekendToggle.checked =
      savedWeekendPreference === null || savedWeekendPreference === "true";
  }
  const instructorToggle = document.querySelector<HTMLInputElement>("#showInstructorToggle");
  if (instructorToggle)
    instructorToggle.checked =
      localStorage.getItem(SHOW_INSTRUCTORS_STORAGE_KEY) === "true";
  const sectionToggle = document.querySelector<HTMLInputElement>("#showSectionToggle");
  if (sectionToggle)
    sectionToggle.checked =
      localStorage.getItem(SHOW_COURSE_SECTION_STORAGE_KEY) !== "false";
}

/**
 * Saves current schedule options in local storage for persistence.
 *
 * @returns {void}
 */
export function saveScheduleOptions(): void {
  localStorage.setItem(TIME_FORMAT_STORAGE_KEY, String(uses24HourTime()));
  localStorage.setItem(HIDE_WEEKENDS_STORAGE_KEY, String(hidesWeekends()));
  localStorage.setItem(SHOW_INSTRUCTORS_STORAGE_KEY, String(showInstructors()));
  localStorage.setItem(SHOW_COURSE_SECTION_STORAGE_KEY, String(showSections()));
}

/**
 * Grabs the currently active schedule name.
 *
 * @returns {string} Active schedule name.
 */
export function getScheduleName(): string {
  return getStoredScheduleName();
}

/**
 * Grabs the saveed schedule name from local storage, if it exists. Default name otherwise.
 *
 * @returns {string} Saved schedule name.
 */
export function getStoredScheduleName(): string {
  const schedule = getActiveSchedule();
  return (schedule && schedule.name
    ? String(schedule.name)
    : DEFAULT_SCHEDULE_NAME
  ).trim().slice(0, SCHEDULE_NAME_MAX_LENGTH);
}

/**
 * Saves the current schedule name into the active workspace.
 *
 * @returns {boolean} Result produced by saveScheduleName.
 * @see {@link schedule-state.updateScheduleWorkspaceName}
 */
export function saveScheduleName(): boolean {
  return updateScheduleWorkspaceName(getScheduleName());
}

/**
 * .Updates the input value of the schedule name.
 *
 * @returns {boolean}
 */
export function normalizeScheduleNameInput(): boolean {
  return saveScheduleName();
}

/**
 * Slugifies the schedule name.
 *
 * @param {string} name - Name to slugify.
 * @returns {string} Slugified name.
 */
export function slugifyScheduleName(name: string): string {
  const slug = (name || DEFAULT_SCHEDULE_NAME)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "schedule";
}
