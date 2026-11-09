/**
 * @fileoverview Loads and renders additional course descriptions and prerequisites.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { createElementWithText } from "./dom.js";
import type { CourseInformation, CourseInformationCourse } from "../types.js";

type DataRecord = Record<string, unknown>;

const DEFAULT_SPECIFICS_BASE_URL =
  "https://ninjao9.github.io/Crimson-Scheduler/api/v1/specifics/";
const specificsCache = new Map<string, Promise<CourseInformation>>();

/**
 * Slugifies the input value.
 *
 * @param value - Value to be slugified.
 * @returns slug (https://wildaboutnature.uk/wp-content/uploads/2024/02/IMG_6426-scaled.jpg).
 */
export function slugify(value: string | number | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Grabs the course-specific key, used for acessing cached course information or for finding url patterns.
 *
 * @param course - Course to generate the key from.
 * @returns Course key.
 */
export function courseSpecificsKey(course: CourseInformationCourse): string {
  return `${slugify(course && course.subject)}-${slugify(course && course.course_number)}`;
}

/**
 * Generates the course-specific url to find course-specific data.
 *
 * @param course - Course to find course-specific data from.
 * @param baseUrl - Base url to derive endpoint.
 * @returns Final constructed url.
 */
export function courseSpecificsUrl(course: CourseInformationCourse, baseUrl: string = DEFAULT_SPECIFICS_BASE_URL): string {
  const base = String(baseUrl || DEFAULT_SPECIFICS_BASE_URL).replace(/\/+$/, "");
  return `${base}/${courseSpecificsKey(course)}.json`;
}

/**
 * Converts a value to a string with protection.
 *
 * @param value - Value to be converted to text.
 * @returns Resulting string from attempted value conversion.
 */
function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * Removes <b> </b> tags and everything between in the given text. Used to polish course descriptions.
 *
 * @param value - string to format.
 * @returns formatted string.
 */
function removeBoldTags(value: unknown): string {
  return text(value)
    .replace(/<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>/gi, "")
    .trim();
}

/**
 * Finds the first valid source in a payload that contains a response.
 *
 * @param payload - Payload containing sources.
 * @returns The first source with a truthy response, or null if no matching source exists.
 */
function asRecord(value: unknown): DataRecord | null {
  return value !== null && typeof value === "object" ? value as DataRecord : null;
}

function firstSource(payload: unknown): DataRecord | null {
  const sources = asRecord(payload)?.sources;
  if (!Array.isArray(sources)) return null;
  return sources.map(asRecord).find((source) => source?.response) ?? null;
}

/**
 * Normalizes specific data from courses to be used later in propgram.
 *
 * @param payload - Value used by normalizeSpecifics.
 * @returns Result produced by normalizeSpecifics.
 */
export function normalizeSpecifics(payload: unknown): Pick<CourseInformation, "description" | "prerequisites"> {
  const source = firstSource(payload);
  const response = asRecord(source?.response) ?? asRecord(payload);
  return {
    description: removeBoldTags(response?.courseDescription || response?.description),
    prerequisites: text(response?.coursePrerequisites || response?.prerequisites),
  };
}

/**
 * Extracts unique instructor names from a course's lecture and lab sections. Excludes missing (TBA).
 *
 * @param course - Course object containing optional lecture and lab section arrays.
 * @returns A list of unique instructor names.
 */
export function instructorNames(course: CourseInformationCourse): string[] {
  const sections = [
    ...((course && course.lecture_sections) || []),
    ...((course && course.lab_sections) || []),
  ];
  const names: string[] = [];
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
 * @param name - Professor to generate a search URL for.
 * @returns Formatted URL to search for professor on RMP.
 */
export function rmpSearchUrl(name: string): string {
  return `https://www.ratemyprofessors.com/search/professors/1143?q=${encodeURIComponent(name)}`;
}

/**
 * Creates preview course information with sample features (Used for demoing if actual data is unavailable).
 *
 * @param course - Course object used to identify course and retrieve names.
 * @returns Preview course information.
 */
function demoInformation(course: CourseInformationCourse): CourseInformation {
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
 * @param payload - Raw course information payload.
 * @param course - Course Object used to retrieve instructor names.
 * @returns Normalized course information.
 */
export function normalizeCourseInformation(payload: unknown, course: CourseInformationCourse): CourseInformation {
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
 * @param course - Course object used to identify course and construct request.
 * @param [options={}] -Options controlling the request.
 * @param [options.reload = false] - Whether to bypass an existing cached result.
 * @param [options.signal] - Signal used to abort request.
 * @param [options.baseUrl] - Optional base URL for the course specifics endpoint.
 * @returns A promise resolving to normalized course information or preview information.
 */
export async function fetchCourseInformation(course: CourseInformationCourse, options: { reload?: boolean; signal?: AbortSignal; baseUrl?: string } = {}): Promise<CourseInformation> {
  const key = courseSpecificsKey(course);
  const cached = specificsCache.get(key);
  if (!options.reload && cached) return cached;
  const request = fetch(courseSpecificsUrl(course, options.baseUrl), { signal: options.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Course specifics request failed with status ${response.status}.`);
      const payload: unknown = await response.json();
      const payloadRecord = asRecord(payload);
      if (payloadRecord?.available === false) throw new Error("Course specifics are not available.");
      return normalizeCourseInformation(payload, course);
    })
    .catch((error) => ({ ...demoInformation(course), error }));
  specificsCache.set(key, request);
  return request;
}

/**
 * Clears the cache of previouslt fetched course-specific information.
 *
 */
export function clearCourseInformationCache(): void {
  specificsCache.clear();
}

/**
 * Renders course descriptions, prerequisites, and instructor names into doc fragment.
 *
 * @param info - Normalized course information.
 * @returns A document fragment containing the rendered course information.
 */
export function renderCourseInformation(info: CourseInformation): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (info.status === "preview") {
    fragment.appendChild(createElementWithText("p", "course-info-preview-note", "Preview information"));
  }
  ([
    ["Course description", info.description],
    ["Prerequisites", info.prerequisites],
  ] as const).forEach(([label, value]) => {
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
