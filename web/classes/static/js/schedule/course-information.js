/**
 * @fileoverview Loads and renders additional course descriptions and prerequisites.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { createElementWithText } from "./dom.js";

const DEFAULT_SPECIFICS_BASE_URL =
  "https://ninjao9.github.io/Crimson-Scheduler/api/v1/specifics/";
const specificsCache = new Map();

/**
 * Slugifies the input value.
 *
 * @param {string} value - Value to be slugified.
 * @returns {string} slug (https://wildaboutnature.uk/wp-content/uploads/2024/02/IMG_6426-scaled.jpg).
 */
export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Grabs the course-specific key, used for acessing cached course information or for finding url patterns.
 *
 * @param {Object} course - Course to generate the key from.
 * @returns {string} Course key.
 */
export function courseSpecificsKey(course) {
  return `${slugify(course && course.subject)}-${slugify(course && course.course_number)}`;
}

/**
 * Generates the course-specific url to find course-specific data.
 *
 * @param {Object} course - Course to find course-specific data from.
 * @param {string} baseUrl - Base url to derive endpoint.
 * @returns {string} Final constructed url.
 */
export function courseSpecificsUrl(course, baseUrl = DEFAULT_SPECIFICS_BASE_URL) {
  const base = String(baseUrl || DEFAULT_SPECIFICS_BASE_URL).replace(/\/+$/, "");
  return `${base}/${courseSpecificsKey(course)}.json`;
}

/**
 * Converts a value to a string with protection.
 *
 * @param {*} value - Value to be converted to text.
 * @returns {string} Resulting string from attempted value conversion.
 */
function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * Removes <b> </b> tags and everything between in the given text. Used to polish course descriptions.
 *
 * @param {string} value - string to format.
 * @returns {string} formatted string.
 */
function removeBoldTags(value) {
  return text(value)
    .replace(/<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>/gi, "")
    .trim();
}

/**
 * Finds the first valid source in a payload that contains a response.
 *
 * @param {Object} payload - Payload containing sources.
 * @returns {Object|null} The first source with a truthy response, or null if no matching source exists.
 */
function firstSource(payload) {
  return Array.isArray(payload && payload.sources) ? payload.sources.find((source) => source && source.response) : null;
}

/**
 * Normalizes specific data from courses to be used later in propgram.
 *
 * @param {Object} payload - Value used by normalizeSpecifics.
 * @returns {{desctiption: string, prerequisites: string}} Result produced by normalizeSpecifics.
 */
export function normalizeSpecifics(payload) {
  const source = firstSource(payload);
  const response = source && source.response ? source.response : payload;
  return {
    description: removeBoldTags(response && (response.courseDescription || response.description)),
    prerequisites: text(response && (response.coursePrerequisites || response.prerequisites)),
  };
}

/**
 * Extracts unique instructor names from a course's lecture and lab sections. Excludes missing (TBA).
 *
 * @param {Object} course - Course object containing optional lecture and lab section arrays.
 * @returns {string[]} A list of unique instructor names.
 */
export function instructorNames(course) {
  const sections = [
    ...((course && course.lecture_sections) || []),
    ...((course && course.lab_sections) || []),
  ];
  const names = [];
  sections.forEach((section) => {
    const name = text(section.instructor);
    if (!name || /^(tba|staff|unknown|n\/a)$/i.test(name)) return;
    if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase())) names.push(name);
  });
  return names;
}

/**
 * Generates a RMP search URL for a given instructor.
 *
 * @param {string} name - Professor to generate a search URL for.
 * @returns {string} Formatted URL to search for professor on RMP.
 */
export function rmpSearchUrl(name) {
  return `https://www.ratemyprofessors.com/search/professors/1143?q=${encodeURIComponent(name)}`;
}

/**
 * Creates preview course information with sample features (Used for demoing if actual data is unavailable).
 *
 * @param {Object} course - Course object used to identify course and retrieve names.
 * @returns {{status: string, prerequisites: string, instructors: string[]}} Preview course information.
 */
function demoInformation(course) {
  const code = text(course && course.course_code) || "this course";
  return {
    status: "preview",
    description: `Sample course description for ${code}. Live course information will appear here when the specifics service is available.`,
    prerequisites: "Sample prerequisite information will appear here when the specifics service is available.",
    instructors: instructorNames(course),
  };
}

/**
 * Normalizes course information payload into a consistent structure.
 *
 * @param {Object} payload - Raw course information payload.
 * @param {Object} course - Course Object used to retrieve instructor names.
 * @returns {{status: string, description: string, prerequisites: string, instructors: string[]}} Normalized course information.
 */
export function normalizeCourseInformation(payload, course) {
  const specifics = normalizeSpecifics(payload);
  return {
    status: "loaded",
    description: specifics.description,
    prerequisites: specifics.prerequisites,
    instructors: instructorNames(course),
  };
}

/**
 * Fetches course-specific information, using the cache when available.
 *
 * @async
 * @param {Object} course - Course object used to identify course and construct request.
 * @param {Object} [options={}] -Options controlling the request.
 * @param {boolean} [options.reload = false] - Whether to bypass an existing cached result.
 * @param {AbortSignal} [options.signal] - Signal used to abort request.
 * @param {string} [options.baseUrl] - Optional base URL for the course specifics endpoint.
 * @returns {Promise<Object>} A promise resolving to normalized course information or preview information.
 */
export async function fetchCourseInformation(course, options = {}) {
  const key = courseSpecificsKey(course);
  if (!options.reload && specificsCache.has(key)) return specificsCache.get(key);
  const request = fetch(courseSpecificsUrl(course, options.baseUrl), { signal: options.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Course specifics request failed with status ${response.status}.`);
      const payload = await response.json();
      if (payload && payload.available === false) throw new Error("Course specifics are not available.");
      return normalizeCourseInformation(payload, course);
    })
    .catch((error) => ({ ...demoInformation(course), error }));
  specificsCache.set(key, request);
  return request;
}

/**
 * Clears the cache of previouslt fetched course-specific information.
 *
 * @returns {void}
 */
export function clearCourseInformationCache() {
  specificsCache.clear();
}

/**
 * Renders course descriptions, prerequisites, and instructor names into doc fragment.
 *
 * @param {Object} info - Normalized course information.
 * @returns {DocumentFragment} A document fragment containing the rendered course information.
 */
export function renderCourseInformation(info) {
  const fragment = document.createDocumentFragment();
  if (info.status === "preview") {
    fragment.appendChild(createElementWithText("p", "course-info-preview-note", "Preview information"));
  }
  [
    ["Course description", info.description],
    ["Prerequisites", info.prerequisites],
  ].forEach(([label, value]) => {
    const section = document.createElement("section");
    section.className = "course-info-section";
    section.append(
      createElementWithText("h3", "course-info-label", label),
      createElementWithText("p", "course-info-value", value || "Not listed"),
    );
    fragment.appendChild(section);
  });
  const instructorSection = document.createElement("section");
  instructorSection.className = "course-info-section";
  instructorSection.appendChild(createElementWithText("h3", "course-info-label", "Instructors"));
  const list = document.createElement("ul");
  list.className = "course-info-instructors";
  if (!info.instructors.length) {
    list.appendChild(createElementWithText("li", "course-info-value", "Not listed"));
  } else {
    info.instructors.forEach((name) => {
      const item = document.createElement("li");
      const link = createElementWithText("a", "course-info-rmp-link", name);
      link.href = rmpSearchUrl(name);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.appendChild(link);
      list.appendChild(item);
    });
  }
  instructorSection.appendChild(list);
  fragment.appendChild(instructorSection);
  return fragment;
}
