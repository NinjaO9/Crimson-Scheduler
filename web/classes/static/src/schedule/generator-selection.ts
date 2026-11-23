/**
 * @fileoverview Manages the courses selected for schedule generation.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { createElementWithText } from "./dom.js";
import type { CatalogCourse, ScheduleRecord } from "../types.js";

type GeneratorSelectionOptions = {
  getActiveSchedule: () => ScheduleRecord | null;
  resolveCourse: (termSlug: string, sectionId: string) => Promise<CatalogCourse | null>;
  onSelectionChange?: () => void;
};

export type GeneratorSelectionController = {
  addCourse: (course: CatalogCourse) => boolean;
  getCourses: () => CatalogCourse[];
  hasCourse: (course: CatalogCourse) => boolean;
  loadFromActiveSchedule: () => Promise<void>;
  removeCourse: (courseKey: string) => boolean;
};

/**
 * Creates a stable identity for a course within a catalog term.
 *
 * @param course - Catalog course to identify.
 * @returns Term-scoped course key used by the generator selection set.
 */
export function generatorCourseKey(course: CatalogCourse): string {
  return `${course.term_slug}:${course.id || course.course_code}`;
}

/**
 * Initializes the generator course collection and returns its mutation API.
 * The selection is held in memory and uses term-scoped keys for set semantics.
 *
 * @param options - Active-schedule accessor and section-to-course resolver.
 * @returns Controller for adding, reading, and reloading selected courses.
 */
export function initializeGeneratorSelection(
  options: GeneratorSelectionOptions,
): GeneratorSelectionController {
  const selectedCourses = new Map<string, CatalogCourse>();
  let loadRequestId = 0;

  const syncSearchButtons = (): void => {
    document.querySelectorAll<HTMLButtonElement>(".generator-course-add").forEach((button) => {
      const selected = selectedCourses.has(button.dataset.courseKey || "");
      button.disabled = selected;
      button.classList.toggle("is-selected", selected);
      button.textContent = "+";
      const courseCode = button.dataset.courseCode || "Course";
      button.setAttribute(
        "aria-label",
        selected ? `${courseCode} is already selected` : `Add ${courseCode}`,
      );
    });
  };

  const render = (loading = false): void => {
    const list = document.getElementById("generatorCourseList");
    const count = document.getElementById("generatorCourseCount");
    if (!list || !count) return;

    const courses = Array.from(selectedCourses.values());
    const countLabel = `(${courses.length})`;
    count.textContent = countLabel;
    const mobileCount = document.getElementById("mobileGeneratorCourseCount");
    if (mobileCount) mobileCount.textContent = countLabel;
    list.replaceChildren();

    if (loading) {
      list.appendChild(
        createElementWithText("p", "misc-subtitle", "Loading courses from the active schedule…"),
      );
    } else if (!courses.length) {
      list.appendChild(
        createElementWithText("p", "misc-subtitle", "Use the + button in search results to select courses."),
      );
    } else {
      courses.forEach((course) => {
        const item = document.createElement("div");
        item.className = "misc-item generator-course-item";
        const details = document.createElement("div");

        const title = createElementWithText(
          "div",
          "misc-course-title",
          `${course.course_code} - ${course.course_name}`,
        );
        const meta = document.createElement("div");
        meta.className = "misc-meta";
        meta.append(
          createElementWithText("span", null, `${course.credits} Credits`),
          createElementWithText(
            "span",
            null,
            course.has_required_lab ? "Lecture + Lab" : "Lecture",
          ),
        );
        if (course.ucore)
          meta.appendChild(createElementWithText("span", null, `UCore: ${course.ucore}`));

        details.append(title, meta);
        const removeButton = createElementWithText(
          "button",
          "manage-btn remove-generator-course-btn",
          "Remove",
        );
        removeButton.type = "button";
        removeButton.dataset.courseKey = generatorCourseKey(course);
        removeButton.setAttribute(
          "aria-label",
          `Remove ${course.course_code} from current selected courses`,
        );

        item.append(details, removeButton);
        list.appendChild(item);
      });
    }

    syncSearchButtons();
  };

  const announce = (message: string): void => {
    const status = document.getElementById("generatorSelectionStatus");
    if (status) status.textContent = message;
  };

  const addCourse = (course: CatalogCourse): boolean => {
    const key = generatorCourseKey(course);
    if (selectedCourses.has(key)) {
      announce(`${course.course_code} is already selected.`);
      syncSearchButtons();
      return false;
    }
    selectedCourses.set(key, course);
    render();
    options.onSelectionChange?.();
    announce(`${course.course_code} added to current selected courses.`);
    return true;
  };

  const removeCourse = (courseKey: string): boolean => {
    const course = selectedCourses.get(courseKey);
    if (!course) return false;

    selectedCourses.delete(courseKey);
    render();
    options.onSelectionChange?.();
    announce(`${course.course_code} removed from current selected courses.`);
    return true;
  };

  const loadFromActiveSchedule = async (): Promise<void> => {
    const requestId = ++loadRequestId;
    selectedCourses.clear();
    options.onSelectionChange?.();
    const schedule = options.getActiveSchedule();
    const references = schedule?.section_refs || [];
    render(references.length > 0);
    if (!references.length) return;

    const results = await Promise.allSettled(
      references.map((reference) =>
        options.resolveCourse(reference.term_slug, reference.section_id),
      ),
    );
    if (requestId !== loadRequestId) return;

    let failedCount = 0;
    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value)
        selectedCourses.set(generatorCourseKey(result.value), result.value);
      else if (result.status === "rejected") failedCount += 1;
    });
    render();
    options.onSelectionChange?.();
    if (failedCount)
      announce(`${failedCount} active schedule ${failedCount === 1 ? "course" : "courses"} could not be loaded.`);
  };

  render();
  return {
    addCourse,
    getCourses: () => Array.from(selectedCourses.values()),
    hasCourse: (course) => selectedCourses.has(generatorCourseKey(course)),
    loadFromActiveSchedule,
    removeCourse,
  };
}
