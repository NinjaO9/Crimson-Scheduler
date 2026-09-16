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
  formatMeetingListForDisplay,
  resolveScheduleGroups,
} from "./time-and-meetings.js";

let renderedBlocksByDay = {};
let activeMobileConflictTrigger = null;
let removeCourse = () => {};

export function getVisibleDays() {
  return isMobileViewport() || hidesWeekends()
    ? DAYS_OF_WEEK.filter((day) => day.key !== "S" && day.key !== "U")
    : DAYS_OF_WEEK;
}
export function getCalendarColumnTemplate() {
  return `${isMobileViewport() ? "56px" : "82px"} repeat(${getVisibleDays().length}, ${isMobileViewport() ? "minmax(64px, 1fr)" : "minmax(96px, 1fr)"})`;
}
export function buildCalendarHeader() {
  const header = document.getElementById("calendarHeader");
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
export function initializeCalendar() {
  const calendarGrid = document.getElementById("calendarGrid");
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
export function applyCourseBlockStacking(block, timeRange) {
  const durationMinutes = Math.max(timeRange.end - timeRange.start, 0);
  const baseZIndex = Math.max(24 * 60 - durationMinutes, 1);
  block.style.setProperty("--course-block-z-index", String(baseZIndex));
  block.style.setProperty(
    "--course-block-conflict-z-index",
    String(baseZIndex + 1),
  );
}
export function renderCourseBlock(dayIndex, timeRange, courseData) {
  const startHour = Math.floor(timeRange.start / 60);
  const startMinute = timeRange.start % 60;
  const cell = document.getElementById(`cell-${dayIndex}-${startHour}`);
  const showInstruct = showInstructors();
  const showSection = showSections();
  if (!cell) return false;
  const block = document.createElement("div");
  block.className = `course-block no-conflict${showInstruct ? " with-instructor" : ""}`;
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
    createCourseBlockLine(formatMeetingListForDisplay(courseData.time)),
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
    removeCourse(courseData.section_id);
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
export function renderSectionGhost(courseData) {
  resolveScheduleGroups(courseData).forEach(({ dayIndexes, timeRange }) =>
    dayIndexes.forEach((dayIndex) =>
      renderGhostBlock(dayIndex, timeRange, courseData),
    ),
  );
}
export function renderGhostBlock(dayIndex, timeRange, courseData) {
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
    createCourseBlockLine(formatMeetingListForDisplay(courseData.time)),
    createCourseBlockLine(courseData.location),
  );
  cell.appendChild(block);
  return true;
}
export function clearSectionGhosts() {
  document
    .querySelectorAll(".course-block.ghost")
    .forEach((block) => block.remove());
}
export function getCourseLabel(courseData) {
  return `${courseData.course_code} (${formatMeetingListForDisplay(courseData.time)})`;
}
export function getCourseRemovalLabel(courseData) {
  return `${courseData.course_code} - ${courseData.section_num}`;
}
export function getUniqueCourses(courses) {
  return courses.filter(
    (course, index) =>
      courses.findIndex(
        (item) => String(item.section_id) === String(course.section_id),
      ) === index,
  );
}
export function getConflictRemovalOptions(courseData, conflicts) {
  return getUniqueCourses([courseData, ...conflicts]);
}
export function createConflictRemovalButton(courseData, className, onRemove) {
  const button = createElementWithText(
    "button",
    className,
    getCourseRemovalLabel(courseData),
  );
  button.type = "button";
  button.setAttribute("data-section-id", courseData.section_id);
  button.setAttribute(
    "aria-label",
    `Remove ${getCourseRemovalLabel(courseData)} from schedule`,
  );
  button.appendChild(
    createElementWithText(
      "span",
      "conflict-remove-meta",
      `${formatMeetingListForDisplay(courseData.time)} - ${courseData.location || "Location: N/A"}`,
    ),
  );
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove(courseData.section_id);
  });
  return button;
}
export function buildCourseTooltip(courseData) {
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
    `${courseData.days} ${formatMeetingListForDisplay(courseData.time)}`,
  );
  appendTextElement(
    fragment,
    "div",
    "",
    courseData.instructor || "Instructor: N/A",
  );
  appendTextElement(
    fragment,
    "div",
    "",
    courseData.location || "Location: N/A",
  );
  appendTextElement(fragment, "div", "", "Click to remove from schedule");
  return fragment;
}
export function buildConflictTooltip(courseData, conflicts) {
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
export function openMobileConflictSheet(triggerBlock, courseData, conflicts) {
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
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("mobile-conflict-sheet-open");
  const firstButton = optionsContainer.querySelector("button");
  if (firstButton) firstButton.focus({ preventScroll: true });
}
export function closeMobileConflictSheet() {
  const sheet = document.getElementById("mobileConflictSheet");
  if (!sheet || !sheet.classList.contains("is-open")) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("mobile-conflict-sheet-open");
  if (
    activeMobileConflictTrigger &&
    document.contains(activeMobileConflictTrigger)
  )
    activeMobileConflictTrigger.focus({ preventScroll: true });
  activeMobileConflictTrigger = null;
}
export function addCourseToCalendar(courseData) {
  let renderedCount = 0;
  resolveScheduleGroups(courseData).forEach(({ dayIndexes, timeRange }) =>
    dayIndexes.forEach((dayIndex) => {
      if (renderCourseBlock(dayIndex, timeRange, courseData))
        renderedCount += 1;
    }),
  );
  return renderedCount;
}
export function applyOverlapHighlighting() {
  Object.keys(renderedBlocksByDay).forEach((dayKey) => {
    const dayBlocks = renderedBlocksByDay[dayKey];
    if (!dayBlocks || dayBlocks.length < 2) return;
    const conflictsByElement = new Map();
    for (let i = 0; i < dayBlocks.length; i++)
      for (let j = i + 1; j < dayBlocks.length; j++) {
        if (
          Math.max(dayBlocks[i].start, dayBlocks[j].start) <
          Math.min(dayBlocks[i].end, dayBlocks[j].end)
        ) {
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
    dayBlocks.forEach((dayBlock) => {
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
export function updateCreditCount(scheduleData) {
  const total = scheduleData.reduce((sum, item) => {
    const credits = parseFloat(
      String(item.credits || "0").replace(/[^\d.]/g, ""),
    );
    return sum + (Number.isFinite(credits) ? credits : 0);
  }, 0);
  document.getElementById("creditCount").textContent = Number.isInteger(total)
    ? total
    : total.toFixed(1);
}
export function renderMiscList(items) {
  const miscList = document.getElementById("miscList");
  document.getElementById("miscCount").textContent = `(${items.length})`;
  if (!items.length) {
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
  items.forEach((item) => {
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
    appendTextElement(
      meta,
      "span",
      "",
      `Instructor: ${item.instructor || "N/A"}`,
    );
    details.appendChild(meta);
    const removeButton = createElementWithText(
      "button",
      "manage-btn remove-misc-btn",
      "Remove",
    );
    removeButton.type = "button";
    removeButton.setAttribute("data-section-id", item.section_id);
    miscItem.append(details, removeButton);
    fragment.appendChild(miscItem);
  });
  miscList.replaceChildren(fragment);
}
export function renderSchedule(scheduleData, { onRemove }) {
  removeCourse = onRemove;
  clearSectionGhosts();
  renderedBlocksByDay = {};
  buildCalendarHeader();
  initializeCalendar();
  const miscItems = [];
  scheduleData.forEach((course) => {
    if (addCourseToCalendar(course) === 0) miscItems.push(course);
  });
  applyOverlapHighlighting();
  updateCreditCount(scheduleData);
  renderMiscList(miscItems);
}
