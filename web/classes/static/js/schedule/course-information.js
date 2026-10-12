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

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function courseSpecificsKey(course) {
  return `${slugify(course && course.subject)}-${slugify(course && course.course_number)}`;
}

export function courseSpecificsUrl(course, baseUrl = DEFAULT_SPECIFICS_BASE_URL) {
  const base = String(baseUrl || DEFAULT_SPECIFICS_BASE_URL).replace(/\/+$/, "");
  return `${base}/${courseSpecificsKey(course)}.json`;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function removeBoldTags(value) {
  return text(value)
    .replace(/<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>/gi, "")
    .trim();
}

function firstSource(payload) {
  return Array.isArray(payload && payload.sources) ? payload.sources.find((source) => source && source.response) : null;
}

export function normalizeSpecifics(payload) {
  const source = firstSource(payload);
  const response = source && source.response ? source.response : payload;
  return {
    description: removeBoldTags(response && (response.courseDescription || response.description)),
    prerequisites: text(response && (response.coursePrerequisites || response.prerequisites)),
  };
}

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

export function rmpSearchUrl(name) {
  return `https://www.ratemyprofessors.com/search/professors/1143?q=${encodeURIComponent(name)}`;
}

function demoInformation(course) {
  const code = text(course && course.course_code) || "this course";
  return {
    status: "preview",
    description: `Sample course description for ${code}. Live course information will appear here when the specifics service is available.`,
    prerequisites: "Sample prerequisite information will appear here when the specifics service is available.",
    instructors: instructorNames(course),
  };
}

export function normalizeCourseInformation(payload, course) {
  const specifics = normalizeSpecifics(payload);
  return {
    status: "loaded",
    description: specifics.description,
    prerequisites: specifics.prerequisites,
    instructors: instructorNames(course),
  };
}

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

export function clearCourseInformationCache() {
  specificsCache.clear();
}

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
