import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generatorCourseKey,
  initializeGeneratorSelection,
} from "../web/classes/static/src/schedule/generator-selection.js";

const course = (id, code, term = "fall-2026") => ({
  id,
  subject: code.split(" ")[0],
  course_number: code.split(" ")[1],
  course_code: code,
  course_name: `${code} course`,
  credits: "3",
  has_required_lab: false,
  lecture_sections: [],
  lab_sections: [],
  ucore: "",
  term_slug: term,
});

describe("generator course selection", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span id="generatorCourseCount"></span>
      <span id="mobileGeneratorCourseCount"></span>
      <div id="generatorCourseList"></div>
      <p id="generatorSelectionStatus"></p>
    `;
  });

  it("resolves active schedule sections into a set of courses", async () => {
    const scheduledCourse = course("cpt-s-121", "CPT_S 121");
    const resolveCourse = vi.fn().mockResolvedValue(scheduledCourse);
    const activeSchedule = {
      id: "default",
      name: "My Schedule",
      section_refs: [
        { term_slug: "fall-2026", section_id: "1001", schedule_group_id: null },
        { term_slug: "fall-2026", section_id: "1002", schedule_group_id: null },
      ],
    };
    const controller = initializeGeneratorSelection({
      getActiveSchedule: () => activeSchedule,
      resolveCourse,
    });

    await controller.loadFromActiveSchedule();

    expect(resolveCourse).toHaveBeenCalledTimes(2);
    expect(controller.getCourses()).toEqual([scheduledCourse]);
    expect(document.querySelectorAll(".generator-course-item")).toHaveLength(1);
    expect(document.getElementById("generatorCourseCount").textContent).toBe("(1)");
    expect(document.getElementById("mobileGeneratorCourseCount").textContent).toBe("(1)");
    expect(document.querySelector(".generator-course-item").textContent).not.toContain(
      "Instructor",
    );
    const removeButton = document.querySelector(".remove-generator-course-btn");
    expect(removeButton.getAttribute("aria-label")).toContain("CPT_S 121");

    expect(controller.removeCourse(generatorCourseKey(scheduledCourse))).toBe(true);
    expect(controller.getCourses()).toHaveLength(0);
    expect(activeSchedule.section_refs).toHaveLength(2);
    expect(document.getElementById("generatorCourseCount").textContent).toBe("(0)");
  });

  it("adds each searched course once and synchronizes its add button", () => {
    const selectedCourse = course("cpt-s-580", "CPT_S 580");
    const button = document.createElement("button");
    button.className = "generator-course-add";
    button.dataset.courseKey = generatorCourseKey(selectedCourse);
    button.dataset.courseCode = selectedCourse.course_code;
    document.body.appendChild(button);
    const controller = initializeGeneratorSelection({
      getActiveSchedule: () => null,
      resolveCourse: vi.fn(),
    });

    expect(controller.addCourse(selectedCourse)).toBe(true);
    expect(controller.addCourse(selectedCourse)).toBe(false);
    expect(controller.getCourses()).toHaveLength(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("+");
    expect(document.getElementById("generatorSelectionStatus").textContent).toContain(
      "already selected",
    );

    expect(controller.removeCourse(generatorCourseKey(selectedCourse))).toBe(true);
    expect(controller.removeCourse(generatorCourseKey(selectedCourse))).toBe(false);
    expect(controller.getCourses()).toHaveLength(0);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("+");
    expect(document.getElementById("generatorSelectionStatus").textContent).toContain(
      "removed",
    );
  });
});
