/**
 * @fileoverview Renders calendar entries and manages course interactions and conflicts.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import {
  DAYS_OF_WEEK,
  END_HOUR,
  HOUR_ROW_HEIGHT,
  START_HOUR,
} from "./constants.js";
import {
  appendTextElement,
  createCourseBlockLine,
  createElementWithText,
} from "./dom.js";
import {
  hidesWeekends,
  showInstructors,
  showSections,
  uses24HourTime,
} from "./preferences.js";
import { isMobileViewport } from "./responsive.js";
import {
  formatHourLabel,
  formatTimeRangeForDisplay,
  resolveScheduleGroups,
} from "./time-and-meetings.js";
import { rmpSearchUrl } from "./course-information.js";
import type { HydratedSection, Meeting } from "../types.js";

type TimeRange = { start: number; end: number };
type CourseBlockElement = HTMLElement & {
  conflictingCourses?: HydratedSection[];
};
type RenderedCourseBlock = {
  element: CourseBlockElement;
  start: number;
  end: number;
  course: HydratedSection;
};
type RemoveCourseHandler = (sectionKey: string) => void;

let renderedBlocksByDay: Record<number, RenderedCourseBlock[]> = {};
let activeMobileConflictTrigger: HTMLElement | null = null;
let activeMobileCourseTrigger: HTMLElement | null = null;
let activeMobileCourse: HydratedSection | null = null;
let removeCourse: RemoveCourseHandler = () => {};

/**
 * Retrieves the visible days available to the user based on the viewport and preferences.
 *
 * @returns Visible days of the week that the user can see.
 */
export function getVisibleDays(): typeof DAYS_OF_WEEK {
  return isMobileViewport() || hidesWeekends()
    ? DAYS_OF_WEEK.filter((day) => day.key !== "S" && day.key !== "U")
    : DAYS_OF_WEEK;
}

/**
 * Generates CSS grid column template for the calendar based on the current viewport size and the number of visible days.
 *
 * @returns The CSS grid column template.
 */
export function getCalendarColumnTemplate(): string {
  return `${isMobileViewport() ? "56px" : "82px"} repeat(${getVisibleDays().length}, ${isMobileViewport() ? "minmax(64px, 1fr)" : "minmax(96px, 1fr)"})`;
}

/**
 * Builds the calendar header by adding the time label and visible day labels
 * to the header element, adjusting day labels for mobile viewports.
 *
 */
export function buildCalendarHeader(): void {
  const header = document.getElementById("calendarHeader")!;
  header.style.gridTemplateColumns = getCalendarColumnTemplate();
  header.replaceChildren(
    createElementWithText("div", "calendar-header-time", "Time"),
  );
  getVisibleDays().forEach((day) => {
    const dayEl = createElementWithText(
      "div",
      "calendar-header-day",
      isMobileViewport() ? day.label.slice(0, 3) : day.label,
    );
    header.appendChild(dayEl);
  });
}

/**
 * Initializes the calendar grid by creating hourly 
 * time slots and day cells for each visible day.
 *
 */
export function initializeCalendar(): void {
  const calendarGrid = document.getElementById("calendarGrid")!;
  calendarGrid.replaceChildren();
  calendarGrid.style.gridTemplateColumns = getCalendarColumnTemplate();
  calendarGrid.style.gridTemplateRows = `repeat(${END_HOUR - START_HOUR}, ${HOUR_ROW_HEIGHT}px)`;
  for (let hour = START_HOUR; hour < END_HOUR; hour++) {
    const timeSlot = createElementWithText(
      "div",
      "calendar-time-slot",
      uses24HourTime()
        ? `${String(hour).padStart(2, "0")}:00`
        : formatHourLabel(hour),
    );
    calendarGrid.appendChild(timeSlot);
    getVisibleDays().forEach((day) => {
      const dayIndex = DAYS_OF_WEEK.findIndex(
        (dayOfWeek) => dayOfWeek.key === day.key,
      );
      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      cell.id = `cell-${dayIndex}-${hour}`;
      calendarGrid.appendChild(cell);
    });
  }
}

/**
 * Determines the z-index of a given course. We want to prioritize shorter classes on top to prevent a course from being totally hidden.
 *
 * @param block - Value used by applyCourseBlockStacking.
 * @param timeRange - Value used by applyCourseBlockStacking.
 * @returns Result produced by applyCourseBlockStacking.
 */
export function applyCourseBlockStacking(block: HTMLElement, timeRange: TimeRange): void {
  const durationMinutes = Math.max(timeRange.end - timeRange.start, 0);
  const baseZIndex = Math.max(24 * 60 - durationMinutes, 1);
  block.style.setProperty("--course-block-z-index", String(baseZIndex));
  block.style.setProperty(
    "--course-block-conflict-z-index",
    String(baseZIndex + 1),
  );
}

/**
 * Positions a course tooltip on the side of its block where it will remain visible inside the schedule's scroll container.
 *
 * @param block - Course block that owns the tooltip.
 * @param tooltip - Tooltip to position.
 * @returns The selected tooltip placement.
 */
export function positionCourseTooltip(block: HTMLElement, tooltip: HTMLElement): "above" | "below" {
  if (!block || !tooltip) return "below";

  const wasHidden = getComputedStyle(tooltip).display === "none";
  if (wasHidden) {
    tooltip.style.display = "block";
    tooltip.style.visibility = "hidden";
  }

  const blockRect = block.getBoundingClientRect();
  const tooltipHeight = tooltip.getBoundingClientRect().height || tooltip.offsetHeight;
  const gap = 7;
  let clipTop = 0;
  let clipBottom = window.innerHeight;
  let ancestor = tooltip.parentElement;

  while (ancestor && ancestor !== document.body) {
    const styles = getComputedStyle(ancestor);
    if (/(auto|scroll|hidden|clip)/.test(`${styles.overflow}${styles.overflowY}`)) {
      const ancestorRect = ancestor.getBoundingClientRect();
      clipTop = Math.max(clipTop, ancestorRect.top);
      clipBottom = Math.min(clipBottom, ancestorRect.bottom);
    }
    ancestor = ancestor.parentElement;
  }

  const fitsBelow = blockRect.bottom + gap + tooltipHeight <= clipBottom;
  const fitsAbove = blockRect.top - gap - tooltipHeight >= clipTop;
  const placeAbove = !fitsBelow && (fitsAbove || blockRect.top - clipTop > clipBottom - blockRect.bottom);
  tooltip.classList.toggle("tooltip-above", placeAbove);

  if (wasHidden) {
    tooltip.style.display = "";
    tooltip.style.visibility = "";
  }

  return placeAbove ? "above" : "below";
}

/**
 * Renders a course block in the calendar grid for the specified day and time range,
 * displaying course details and configuring interactions for desktop and mobile viewports.
 * Tracks the rendered block for conflict detection and schedule layout management.
 *
 * @param dayIndex - Index of the day on which the course is scheduled.
 * @param timeRange - The course time range in minutes from midnight.
 * @param courseData - Course information, supplied by courseAPI.
 * @param meeting - Meeting represented by this block.
 * @returns True if the course block was rendered successfully. Otherwise, false.
 */
export function renderCourseBlock(dayIndex: number, timeRange: TimeRange, courseData: HydratedSection, meeting: Meeting): boolean {
  const startHour = Math.floor(timeRange.start / 60);
  const startMinute = timeRange.start % 60;
  const cell = document.getElementById(`cell-${dayIndex}-${startHour}`);
  const showInstruct = showInstructors();
  const showSection = showSections();
  if (!cell) return false;
  const block = document.createElement(isMobileViewport() ? "button" : "div") as CourseBlockElement;
  block.className = `course-block no-conflict${showInstruct ? " with-instructor" : ""}`;
  if (isMobileViewport()) {
    if (block instanceof HTMLButtonElement) block.type = "button";
    block.setAttribute(
      "aria-label",
      `${courseData.course_code} ${meeting?.days || "Days unavailable"} | ${formatTimeRangeForDisplay(meeting?.time)}. Tap for course actions.`,
    );
  }
  block.style.height =
    Math.max(((timeRange.end - timeRange.start) / 60) * 100, 0) + "%";
  block.style.minHeight = "30px";
  block.style.top = (startMinute / 60) * 100 + "%";
  applyCourseBlockStacking(block, timeRange);
  block.appendChild(
    createCourseBlockLine(
      `${courseData.course_code}${showSection ? ` - ${courseData.section_num}` : ""}`,
    ),
  );
  block.appendChild(
    createCourseBlockLine(formatTimeRangeForDisplay(meeting && meeting.time)),
  );
  block.appendChild(createCourseBlockLine(courseData.location));
  if (showInstruct)
    block.appendChild(createCourseBlockLine(courseData.instructor));
  block.setAttribute("data-section-id", courseData.section_id);
  block.setAttribute("data-start-minutes", String(timeRange.start));
  block.setAttribute("data-end-minutes", String(timeRange.end));
  const tooltip = document.createElement("div");
  tooltip.className = "course-block-tooltip";
  tooltip.appendChild(buildCourseTooltip(courseData));
  block.appendChild(tooltip);
  // Little listener for each block, cause if we scroll or something to mess with the calendar we have to recalculate where the tooltip should be.
  block.addEventListener("mouseenter", () => {
    window.requestAnimationFrame(() => positionCourseTooltip(block, tooltip));
  });
  block.addEventListener("click", (event) => {
    event.stopPropagation();
    if (
      isMobileViewport() &&
      block.conflictingCourses &&
      block.conflictingCourses.length
    ) {
      openMobileConflictSheet(block, courseData, block.conflictingCourses);
      return;
    }
    if (isMobileViewport()) {
      openMobileCourseSheet(block, courseData);
      return;
    }
    removeCourse(courseData.section_key || courseData.section_id);
  });
  cell.appendChild(block);
  if (!renderedBlocksByDay[dayIndex]) renderedBlocksByDay[dayIndex] = [];
  renderedBlocksByDay[dayIndex].push({
    element: block,
    start: timeRange.start,
    end: timeRange.end,
    course: courseData,
  });
  return true;
}

/**
 * Renders ghost blocks to preview a course's scheduled meeting times
 * across all days and time ranges without actually adding it to the schedule.
 *
 * @param courseData - Course information supplied by courseAPI.
 */
export function renderSectionGhost(courseData: HydratedSection): void {
  resolveScheduleGroups(courseData.meetings).forEach(({ dayIndexes, timeRange, meeting }) =>
    dayIndexes.forEach((dayIndex) =>
      renderGhostBlock(dayIndex, timeRange, courseData, meeting),
    ),
  );
}

/**
 * Renders a specific ghost block in the schedule grid to preview a course's
 * scheduled time and meeting details without adding it as an active course block.
 *
 * @param dayIndex - Index of the day on which the course is scheduled.
 * @param timeRange - The course time range in minutes from midnight.
 * @param courseData - Course information supplied by courseAPI.
 * @param meeting - Meeting represented by this block.
 * @returns True if the ghost block was rendered successfully. Otherwise, false.
 */
export function renderGhostBlock(dayIndex: number, timeRange: TimeRange, courseData: HydratedSection, meeting: Meeting): boolean {
  const cell = document.getElementById(
    `cell-${dayIndex}-${Math.floor(timeRange.start / 60)}`,
  );
  if (!cell) return false;
  const block = document.createElement("div");
  block.className = "course-block ghost";
  block.style.height =
    Math.max(((timeRange.end - timeRange.start) / 60) * 100, 0) + "%";
  block.style.minHeight = "30px";
  block.style.top = ((timeRange.start % 60) / 60) * 100 + "%";
  block.append(
    createCourseBlockLine(courseData.course_code),
    createCourseBlockLine(formatTimeRangeForDisplay(meeting && meeting.time)),
    createCourseBlockLine(courseData.location),
  );
  cell.appendChild(block);
  return true;
}

/**
 * Removes all ghost course blocks from the calendar to clear previews.
 *
 */
export function clearSectionGhosts(): void {
  document
    .querySelectorAll(".course-block.ghost")
    .forEach((block) => block.remove());
}

/**
 * Generates a display label for a course using its course code
 * and formatted meeting times.
 *
 * @param courseData - Course information supplied by courseAPI.
 * @returns The formatted course label.
 */
export function getCourseLabel(courseData: HydratedSection): string {
  const meetings = Array.isArray(courseData.meetings) ? courseData.meetings : [];
  const meetingLabel = meetings
    .map((meeting) => `${meeting.days || "Days unavailable"} | ${formatTimeRangeForDisplay(meeting.time)}`)
    .join("\n") || "Meetings unavailable";
  return `${courseData.course_code} (${meetingLabel})`;
}

/**
 * Generates a label identifying a course section for removal actions.
 *
 * @param courseData - Course information supplied by courseAPI.
 * @returns The course code and section number, supplied as a removal label.
 */
export function getCourseRemovalLabel(courseData: HydratedSection): string {
  return `${courseData.course_code} - ${courseData.section_num}`;
}

/**
 * Filters a course list to retain only the first occurance of eaach unique
 * section, identifying duplicates via the section ID.
 *
 * @param courses - The list of course objects to deduplicate.
 * @returns List of deduplicated courses.
 */
export function getUniqueCourses(courses: HydratedSection[]): HydratedSection[] {
  return courses.filter(
    (course, index) =>
      courses.findIndex(
        (item) => String(item.section_id) === String(course.section_id),
      ) === index,
  );
}

/**
 * Wrapper for getUniqueCourses; retrieves all conflicting courses,
 * showcasing them as options to resolve a conflict.
 * 
 * @see {@link getUniqueCourses}
 *
 * @param courseData - Course information supplied by courseAPI.
 * @param conflicts - A list of conflicts, which conflict with courseData.
 * @returns A list of unique courses, all of which are conflicting.
 */
export function getConflictRemovalOptions(courseData: HydratedSection, conflicts: HydratedSection[]): HydratedSection[] {
  return getUniqueCourses([courseData, ...conflicts]);
}

/**
 * Creates a button for removing a course from a schedule.
 *
 * @param courseData - Course information supplied by courseAPI.
 * @param className - CSS class name to apply to the button.
 * @param onRemove - Callback invoked with the course's section key or sectionID when the button is clicked.
 * @returns The configured course removal button.
 */
export function createConflictRemovalButton(courseData: HydratedSection, className: string, onRemove: RemoveCourseHandler): HTMLButtonElement {
  const button = createElementWithText(
    "button",
    className,
    getCourseRemovalLabel(courseData),
  );
  button.type = "button";
  button.setAttribute("data-section-id", courseData.section_id);
  button.setAttribute(
    "data-section-key",
    courseData.section_key || courseData.section_id,
  );
  button.setAttribute(
    "aria-label",
    `Remove ${getCourseRemovalLabel(courseData)} from schedule`,
  );
  button.appendChild(
    createElementWithText(
      "span",
      "conflict-remove-meta",
      `${(Array.isArray(courseData.meetings) ? courseData.meetings : [])
        .map((meeting) => formatTimeRangeForDisplay(meeting?.time))
        .filter(Boolean)
        .join("\n") || "Time unavailable"} - ${courseData.location || "Location: N/A"}`,
    ),
  );
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove(courseData.section_key || courseData.section_id);
  });
  return button;
}

/**
 * Building a tooltip containing a course's identifying information, meeting, 
 * schedule, instructor, location, UCore, and interaction instructions.
 *
 * @param courseData - Course inforamtion supplied by courseAPI.
 * @returns A document fragment containing the course tooltip content.
 */
export function buildCourseTooltip(courseData: HydratedSection): DocumentFragment {
  const fragment = document.createDocumentFragment();
  appendTextElement(
    fragment,
    "strong",
    "",
    `${courseData.course_code} - ${courseData.section_num}`,
  );
  appendTextElement(fragment, "div", "", courseData.course_name || "");
  appendTextElement(
    fragment,
    "div",
    "",
    (Array.isArray(courseData.meetings) ? courseData.meetings : [])
      .map((meeting) => `${meeting.days || "Days unavailable"} | ${formatTimeRangeForDisplay(meeting.time)}`)
      .join("\n") || "Meetings unavailable",
  );
  const instructorElement = appendTextElement(
    fragment,
    "a",
    "",
    courseData.instructor || "Instructor: N/A",
  );
  instructorElement.href = rmpSearchUrl(courseData.instructor);
  instructorElement.target = "_blank";
  instructorElement.rel = "noopener noreferrer";
  instructorElement.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  appendTextElement(
    fragment,
    "div",
    "",
    courseData.location || "Location: N/A",
  );
  if (courseData.ucore != "")
  {
    appendTextElement(
      fragment,
      "div",
      "",
      `UCore: ${courseData.ucore}`,
    );
  }
  appendTextElement(
    fragment,
    "div",
    "",
    isMobileViewport()
      ? "Tap to view course actions"
      : "Click to remove from schedule",
  );
  return fragment;
}

/**
 * Builds a tooltip describing a time conflict and providing removal buttons
 * for the conflicting course sections.
 *
 * @param courseData - Course associated with the conflict.
 * @param conflicts - Courses whose meeting times overlap with the specified course.
 * @returns A document fragment containing the conflict message and removal options..
 */
export function buildConflictTooltip(courseData: HydratedSection, conflicts: HydratedSection[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  appendTextElement(fragment, "strong", "", "Time Conflict");
  appendTextElement(fragment, "div", "", "Remove a class from this conflict:");
  getConflictRemovalOptions(courseData, conflicts).forEach((course) =>
    fragment.appendChild(
      createConflictRemovalButton(course, "conflict-remove-btn", removeCourse),
    ),
  );
  return fragment;
}

/**
 * Opens the moble conflict sheet and displays options for removing a course.
 *
 * @param triggerBlock - Course block that triggered the conflict sheet.
 * @param courseData - Course associated with the conflict.
 * @param conflicts - Courses whose meeting times overlap with the specified course.
 */
export function openMobileConflictSheet(triggerBlock: HTMLElement, courseData: HydratedSection, conflicts: HydratedSection[]): void {
  const sheet = document.getElementById("mobileConflictSheet");
  const subtitle = document.getElementById("mobileConflictSubtitle");
  const optionsContainer = document.getElementById("mobileConflictOptions");
  if (!sheet || !subtitle || !optionsContainer) return;
  activeMobileConflictTrigger = triggerBlock;
  subtitle.textContent = "Choose one class to remove from this overlap.";
  const fragment = document.createDocumentFragment();
  getConflictRemovalOptions(courseData, conflicts).forEach((course) =>
    fragment.appendChild(
      createConflictRemovalButton(
        course,
        "mobile-conflict-remove-btn",
        (sectionId) => {
          closeMobileConflictSheet();
          removeCourse(sectionId);
        },
      ),
    ),
  );
  optionsContainer.replaceChildren(fragment);
  sheet.hidden = false;
  sheet.inert = false;
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("mobile-conflict-sheet-open");
  const firstButton = optionsContainer.querySelector("button");
  if (firstButton) firstButton.focus({ preventScroll: true });
}

/**
 * Closes the mobile conflict sheet.
 *
 */
export function closeMobileConflictSheet(): void {
  const sheet = document.getElementById("mobileConflictSheet");
  if (!sheet || !sheet.classList.contains("is-open")) return;
  sheet.classList.remove("is-open");
  sheet.inert = true;
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("mobile-conflict-sheet-open");
  window.setTimeout(() => {
    if (!sheet.classList.contains("is-open")) sheet.hidden = true;
  }, 180);
  if (
    activeMobileConflictTrigger &&
    document.contains(activeMobileConflictTrigger)
  )
    activeMobileConflictTrigger.focus({ preventScroll: true });
  activeMobileConflictTrigger = null;
}

/**
 * Opens the mobile course details sheet, displaying information about the selected course.
 *
 * @param trigger - Element that triggered the course sheet.
 * @param courseData - Course information to display.
 */
export function openMobileCourseSheet(trigger: HTMLElement, courseData: HydratedSection): void {
  const sheet = document.getElementById("mobileCourseSheet");
  const details = document.getElementById("mobileCourseDetails");
  const removeButton = document.getElementById("mobileCourseRemove");
  if (!sheet || !details || !removeButton) return;
  activeMobileCourseTrigger = trigger;
  activeMobileCourse = courseData;
  details.replaceChildren();
  appendTextElement(
    details,
    "div",
    "mobile-course-name",
    courseData.course_name || courseData.course_code,
  );
  appendTextElement(
    details,
    "div",
    "mobile-course-code",
    `${courseData.course_code} · Section ${courseData.section_num || "N/A"}`,
  );
  appendTextElement(
    details,
    "div",
    "mobile-course-meta",
    (Array.isArray(courseData.meetings) ? courseData.meetings : [])
      .map((meeting) => `${meeting.days || "Days unavailable"} | ${formatTimeRangeForDisplay(meeting.time)}`)
      .join("\n") || "Meetings unavailable",
  );
  appendTextElement(
    details,
    "div",
    "mobile-course-meta",
    `Location: ${courseData.location || "N/A"}`,
  );
  // Making an instructor-specific container so that we can separate the instructor: text from the name
  const instructorMeta = appendTextElement(
    details,
    "div",
    "mobile-course-meta",
    "Instructor: ",
  );
  if (courseData.instructor) {
    const instructorElement = appendTextElement(
      instructorMeta,
      "a",
      "",
      courseData.instructor,
    );
    instructorElement.href = rmpSearchUrl(courseData.instructor);
    instructorElement.target = "_blank";
    instructorElement.rel = "noopener noreferrer";
  } else {
    instructorMeta.appendChild(document.createTextNode("N/A"));
  }
  appendTextElement(
    details,
    "div",
    "mobile-course-meta",
    `Credits: ${courseData.credits || "0"}`,
  );
  if (courseData.ucore != '')
  {
    appendTextElement(
      details,
      "div",
      "mobile-course-meta",
      `UCore: ${courseData.ucore}`,
    );
  }
  sheet.hidden = false;
  sheet.inert = false;
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("mobile-course-sheet-open");
  window.requestAnimationFrame(() => sheet.classList.add("is-open"));
  removeButton.focus({ preventScroll: true });
}

/**
 * Closes the mobile course details sheet.
 *
 * @param [options={}] - Options controlling the sheet's closing behavior.
 * @param [options.restoreFocus=true] - Whether to restore focus to the triggering element.
 */
export function closeMobileCourseSheet({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  const sheet = document.getElementById("mobileCourseSheet");

  if (!sheet || !sheet.classList.contains("is-open")) return;
  sheet.classList.remove("is-open");
  sheet.inert = true;
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("mobile-course-sheet-open");
  window.setTimeout(() => {
    if (!sheet.classList.contains("is-open")) sheet.hidden = true;
  }, 180);

  if (
    restoreFocus &&
    activeMobileCourseTrigger &&
    document.contains(activeMobileCourseTrigger)
  )
    activeMobileCourseTrigger.focus({ preventScroll: true });

  activeMobileCourseTrigger = null;
  activeMobileCourse = null;
}

/**
 * Removes the currently selected course from the schedule
 * and closes the mobile course details sheet without restoring focus.
 *
 */
export function removeActiveMobileCourse(): void {
  if (!activeMobileCourse) return;
  const sectionId = activeMobileCourse.section_key || activeMobileCourse.section_id;
  closeMobileCourseSheet({ restoreFocus: false });
  removeCourse(sectionId);
}

/**
 * Adds course's scheduled meeting blocks to the schedule.
 *
 * @param courseData - Course information used to determine the scheduled meeting groups and block locations.
 * @returns The number of calendar blocks succesfully rendered.
 */
export function addCourseToCalendar(courseData: HydratedSection): number {
  let renderedCount = 0;
  resolveScheduleGroups(courseData.meetings).forEach(({ dayIndexes, timeRange, meeting }) =>
    dayIndexes.forEach((dayIndex) => {
      if (renderCourseBlock(dayIndex, timeRange, courseData, meeting))
        renderedCount += 1;
    }),
  );
  return renderedCount;
}

/**
 * Detects overlapping course time ranged within each calendar day, highlighting conflicting blocks,
 * and updates their tooltips with course removal options.
 *
 */
export function applyOverlapHighlighting(): void {
  Object.keys(renderedBlocksByDay).forEach((dayKey) => { // for every day, check for a conflict
    const dayBlocks = renderedBlocksByDay[Number(dayKey)];
    if (!dayBlocks || dayBlocks.length < 2) return;
    const conflictsByElement = new Map();
    for (let i = 0; i < dayBlocks.length; i++)
      for (let j = i + 1; j < dayBlocks.length; j++) {
        if ( // if there exists a course that starts before the other ends, then there is a conflict.
          Math.max(dayBlocks[i].start, dayBlocks[j].start) <
          Math.min(dayBlocks[i].end, dayBlocks[j].end)
        ) { // if there is a conflict, add the courses to each other's conflict list
          dayBlocks[i].element.classList.add("conflict");
          dayBlocks[j].element.classList.add("conflict");
          if (!conflictsByElement.has(dayBlocks[i].element))
            conflictsByElement.set(dayBlocks[i].element, []);
          if (!conflictsByElement.has(dayBlocks[j].element))
            conflictsByElement.set(dayBlocks[j].element, []);
          conflictsByElement
            .get(dayBlocks[i].element)
            .push(dayBlocks[j].course);
          conflictsByElement
            .get(dayBlocks[j].element)
            .push(dayBlocks[i].course);
        }
      }
    dayBlocks.forEach((dayBlock) => { // If courses have a conflict, generate their conflict tooltip
      const conflicts = conflictsByElement.get(dayBlock.element);
      if (!conflicts || !conflicts.length) return;
      const tooltip = dayBlock.element.querySelector(".course-block-tooltip");
      if (tooltip) {
        tooltip.classList.add("conflict-tooltip");
        tooltip.replaceChildren(
          buildConflictTooltip(dayBlock.course, conflicts),
        );
      }
      dayBlock.element.conflictingCourses = conflicts;
    });
  });
}

/**
 * Calculates the total credis for the supplied schedule and updates the credit count.
 *
 * @param scheduleData - List of the scheduled courses.
 */
export function updateCreditCount(scheduleData: HydratedSection[]): void {
  // Some courses contain a "V" rather than an actual number. This means the credit varies.
  // We can calculate the 'static' credit count (How much we are confident we can get)
  // Then, we can calculate the varied amount (Basically, how many courses do we have that contain "V")
  // We can append something that then shows ({static} + (1-4) credits
  // The 1-4 can be multiplied by the varied count.
  const minimumVariedCredit = 1;
  const maximumVariedCredit = 4;

  // Here, if the credit is a real number, then we add it to static
  const totalStatic = scheduleData.reduce((sum, item) => {
    const regulatedCredits = String(item.credits || "0").replace(/[^\dV]/g, "");
    const credits = parseFloat(regulatedCredits);
    return sum + (Number.isFinite(credits) ? credits : 0);
  }, 0);

  // Otherwise, it is V (I don't believe there is an alternative) and we add it to the varied.
  const totalVaried = scheduleData.reduce((sum, item) => {
    const regulatedCredits = String(item.credits || "0").replace(/[^\dV]/g, "");
    const credits = parseFloat(regulatedCredits);
    return sum + (Number.isNaN(credits) ? 1 : 0);
  }, 0);

  let creditText = Number.isInteger(totalStatic) ? String(totalStatic) : String(totalStatic.toFixed(1));

  if (totalVaried > 0)
  {
    creditText = String(`${totalStatic + (minimumVariedCredit * totalVaried)} - ${totalStatic + (maximumVariedCredit * totalVaried)}`);
  }

  document.getElementById("creditCount")!.textContent = creditText;
}

/**
 * Render the list of unscheduled courses.
 *
 * @param items - List of unscheduled course objects to display.
 */
export function renderMiscList(items: HydratedSection[]): void {
  const miscList = document.getElementById("miscList")!;
  const countLabel = `(${items.length})`;
  document.getElementById("miscCount")!.textContent = countLabel;
  const mobileCount = document.getElementById("mobileMiscCount");
  if (mobileCount) mobileCount.textContent = countLabel;
  if (!items.length) { // Default text if there are no items
    miscList.replaceChildren(
      createElementWithText(
        "div",
        "misc-subtitle",
        "No unscheduled classes added.",
      ),
    );
    return;
  }
  const fragment = document.createDocumentFragment();
  items.forEach((item) => { // Generating a block for each item
    const miscItem = document.createElement("div");
    miscItem.className = "misc-item";
    const details = document.createElement("div");
    appendTextElement(
      details,
      "div",
      "misc-course-title",
      `${item.course_code} - ${item.course_name || "Class"}`,
    );
    const meta = document.createElement("div");
    meta.className = "misc-meta";
    appendTextElement(meta, "span", "", `${item.credits || 0} Credits`);
    appendTextElement(
      meta,
      "span",
      "",
      `Section ${item.section_num} (${item.is_lab ? "Lab" : "Lecture"})`,
    );
    const instructorMeta = document.createElement("span");
    instructorMeta.appendChild(document.createTextNode("Instructor: "));
    if (item.instructor) {
      const instructorElement = appendTextElement(
        instructorMeta,
        "a",
        "",
        item.instructor,
      );
      instructorElement.href = rmpSearchUrl(item.instructor);
      instructorElement.target = "_blank";
      instructorElement.rel = "noopener noreferrer";
    } else {
      instructorMeta.appendChild(document.createTextNode("N/A"));
    }
    meta.appendChild(instructorMeta);
    if (item.ucore != "")
    {
      appendTextElement(
        meta,
        "span",
        "",
        `UCore: ${item.ucore}`,
      );
    }
    details.appendChild(meta);
    const removeButton = createElementWithText(
      "button",
      "manage-btn remove-misc-btn",
      "Remove",
    );
    removeButton.type = "button";
    removeButton.setAttribute("data-section-id", item.section_id);
    removeButton.setAttribute(
      "data-section-key",
      item.section_key || item.section_id,
    );
    miscItem.append(details, removeButton);
    fragment.appendChild(miscItem);
  });
  miscList.replaceChildren(fragment);
}

/**
 * Renders the complete schedule by rebuilding the schedule, placing scheduled courses,
 * finding overlaps, updating the credit count, and displaying misc. courses.
 *
 * @param scheduleData - List of course objects in the schedule.
 * @param options - Configuration options for rendering the schedule.
 * @param options.onRemove - Callback used to remove a section from the schedule.
 */
export function renderSchedule(scheduleData: HydratedSection[], { onRemove }: { onRemove: RemoveCourseHandler }): void {
  removeCourse = onRemove;
  clearSectionGhosts();
  renderedBlocksByDay = {};
  buildCalendarHeader();
  initializeCalendar();
  const miscItems: HydratedSection[] = [];
  scheduleData.forEach((course) => {
    if (addCourseToCalendar(course) === 0) miscItems.push(course);
  });
  applyOverlapHighlighting();
  updateCreditCount(scheduleData);
  renderMiscList(miscItems);
}
