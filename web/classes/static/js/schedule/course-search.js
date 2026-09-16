import { createElementWithText } from "./dom.js";
import { debounce, isMobileViewport } from "./responsive.js";
import { formatMeetingListForDisplay } from "./time-and-meetings.js";

let courseSearchRequestId = 0;
let courseFilters = createEmptyCourseFilters();
let mobileFilterCloseTimer = null;
let callbacks = {};
const AUTO_SEARCH_DELAY_MS = 250;

export function createEmptyCourseFilters() {
  return { openOnly: false, delivery: [] };
}
export function getActiveFilterGroupCount() {
  return (
    Number(courseFilters.openOnly) + Number(courseFilters.delivery.length > 0)
  );
}
export function resetCourseFilters(clearQuery) {
  const form = document.getElementById("courseSearchForm");
  if (form && form.autoSearch && form.autoSearch.cancel)
    form.autoSearch.cancel();
  courseFilters = createEmptyCourseFilters();
  if (clearQuery && form) form.querySelector("#searchInput").value = "";
  syncCourseFilterControls();
}
export function updateCourseFiltersFromControl(control) {
  const filterName = control.getAttribute("data-filter-name");
  if (filterName === "openOnly") courseFilters.openOnly = control.checked;
  else if (filterName === "delivery") {
    const values = new Set(courseFilters.delivery);
    if (control.checked) values.add(control.value);
    else values.delete(control.value);
    courseFilters.delivery = [...values];
  }
}
export function syncCourseFilterControls() {
  document
    .querySelectorAll('.course-filter-control[data-filter-name="delivery"]')
    .forEach((input) => {
      input.checked = courseFilters.delivery.includes(input.value);
    });
  document
    .querySelectorAll('.course-filter-control[data-filter-name="openOnly"]')
    .forEach((input) => {
      input.checked = courseFilters.openOnly;
    });
  const count = getActiveFilterGroupCount();
  const countElement = document.getElementById("filterCount");
  if (countElement) {
    countElement.textContent = `· ${count}`;
    countElement.hidden = count === 0;
  }
}
export function populateCourseFilterOptions() {
  populateFilterCheckboxes("delivery", [
    { value: "in-person", label: "In person" },
    { value: "online", label: "Online" },
    { value: "arranged", label: "Arranged" },
  ]);
  syncCourseFilterControls();
}
export function populateFilterCheckboxes(filterName, options) {
  document
    .querySelectorAll(`[data-filter-options="${filterName}"]`)
    .forEach((container) =>
      container.replaceChildren(
        ...options.map((option) => {
          const label = createElementWithText("label", "filter-check", "");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = option.value;
          input.className = "course-filter-control";
          input.setAttribute("data-filter-name", filterName);
          label.append(input, document.createTextNode(` ${option.label}`));
          return label;
        }),
      ),
    );
}
export function openCourseFilters() {
  const toggle = document.getElementById("filterToggle");
  if (!toggle || toggle.disabled) return;
  if (isMobileViewport()) {
    const sheet = document.getElementById("mobileFilterSheet");
    if (mobileFilterCloseTimer) {
      window.clearTimeout(mobileFilterCloseTimer);
      mobileFilterCloseTimer = null;
    }
    sheet.hidden = false;
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("mobile-filter-sheet-open");
    window.requestAnimationFrame(() => sheet.classList.add("is-open"));
    const doneButton = sheet.querySelector("[data-close-filters]");
    if (doneButton) doneButton.focus({ preventScroll: true });
  } else {
    const popover = document.getElementById("desktopFilterPopover");
    popover.hidden = false;
    popover
      .querySelector("[data-close-filters]")
      .focus({ preventScroll: true });
  }
  toggle.setAttribute("aria-expanded", "true");
}
export function closeCourseFilters() {
  const popover = document.getElementById("desktopFilterPopover");
  const sheet = document.getElementById("mobileFilterSheet");
  const activeElement = document.activeElement;
  const restoreFocus =
    (popover && popover.contains(activeElement)) ||
    (sheet && sheet.contains(activeElement));
  if (popover) popover.hidden = true;
  if (sheet) {
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    if (mobileFilterCloseTimer) window.clearTimeout(mobileFilterCloseTimer);
    mobileFilterCloseTimer = window.setTimeout(() => {
      sheet.hidden = true;
      mobileFilterCloseTimer = null;
    }, 180);
  }
  document.body.classList.remove("mobile-filter-sheet-open");
  const toggle = document.getElementById("filterToggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }
}
export function isDesktopFilterOpen() {
  const popover = document.getElementById("desktopFilterPopover");
  return !!popover && !popover.hidden;
}
export function areCourseFiltersOpen() {
  const sheet = document.getElementById("mobileFilterSheet");
  return (
    isDesktopFilterOpen() || !!(sheet && sheet.classList.contains("is-open"))
  );
}
export function renderSectionChoice(course, section, choiceType) {
  const sectionId = String(
    section.section_id === null || section.section_id === undefined
      ? ""
      : section.section_id,
  );
  const courseId = String(
    course.id === null || course.id === undefined ? "" : course.id,
  );
  const label = choiceType === "lab" ? "Lab" : "Lecture";
  const row = document.createElement("label");
  row.className = "section-choice-row";
  const select = document.createElement("span");
  select.className = "section-select";
  const input = document.createElement("input");
  input.className = "section-choice";
  input.type = "radio";
  input.value = sectionId;
  input.name = `${choiceType}-${courseId}`;
  [
    ["data-choice-type", choiceType],
    ["data-course-id", courseId],
    ["data-section-id", sectionId],
    ["data-course-code", course.course_code],
    ["data-course-name", course.course_name],
    ["data-term-slug", course.term_slug],
    ["data-section-num", section.section_num],
    ["data-instructor", section.instructor],
    ["data-location", section.location],
    ["data-days", section.days],
    ["data-time", section.time],
    ["data-seats", section.seats],
    ["data-credits", section.credits],
    ["data-is-lab", section.is_lab],
    ["data-component", section.component],
  ].forEach(([name, value]) =>
    input.setAttribute(
      name,
      String(value === null || value === undefined ? "" : value),
    ),
  );
  select.append(
    input,
    createElementWithText("strong", null, section.section_num),
  );
  row.append(
    select,
    createElementWithText("span", null, label),
    createElementWithText("span", "time-display", section.time),
    createElementWithText("span", null, section.days),
    createElementWithText("span", null, section.location),
    createElementWithText("span", null, section.instructor),
  );
  row.children[2].setAttribute(
    "data-time",
    String(
      section.time === null || section.time === undefined ? "" : section.time,
    ),
  );
  return row;
}
export function renderCourseResult(course) {
  const hasLab = course.lab_sections.length > 0;
  const article = document.createElement("article");
  article.className = "result-card";
  const summary = document.createElement("button");
  summary.className = "result-summary";
  summary.type = "button";
  summary.setAttribute("data-bs-toggle", "collapse");
  summary.setAttribute("data-bs-target", `#sections${course.id}`);
  summary.setAttribute("data-bs-parent", "#courseResultsAccordion");
  summary.setAttribute("aria-expanded", "false");
  const summaryText = document.createElement("span");
  const title = createElementWithText(
    "span",
    "result-title",
    `${course.course_code} - ${course.course_name}`,
  );
  const meta = document.createElement("span");
  meta.className = "result-meta";
  meta.append(
    createElementWithText("span", null, `${course.credits} Credits`),
    createElementWithText(
      "span",
      null,
      course.has_required_lab ? "Lecture + Lab" : "Lecture",
    ),
  );
  summaryText.append(title, meta);
  summary.append(
    summaryText,
    createElementWithText("span", "result-chevron", ""),
  );
  const panel = document.createElement("div");
  panel.className = "collapse";
  panel.id = `sections${course.id}`;
  panel.setAttribute("data-bs-parent", "#courseResultsAccordion");
  const body = createElementWithText("div", "result-body", "");
  body.append(
    createSectionGroupTitle("Select a Lecture", course.has_required_lab),
    createSectionTable(course, course.lecture_sections, "lecture"),
  );
  if (hasLab)
    body.append(
      createSectionGroupTitle("Select a Lab", true, "lab-title"),
      createSectionTable(course, course.lab_sections, "lab"),
    );
  const actionRow = createElementWithText("div", "course-action-row", "");
  const addButton = createElementWithText(
    "button",
    "add-course-selection-btn",
    "Add to Schedule",
  );
  addButton.type = "button";
  addButton.disabled = true;
  addButton.setAttribute("data-course-id", course.id);
  addButton.setAttribute("data-requires-lab", String(course.has_required_lab));
  actionRow.appendChild(addButton);
  body.appendChild(actionRow);
  panel.appendChild(body);
  article.append(summary, panel);
  return article;
}
export function createSectionGroupTitle(label, required, className) {
  const title = createElementWithText(
    "div",
    `section-group-title${className ? ` ${className}` : ""}`,
    label,
  );
  if (required)
    title.appendChild(createElementWithText("span", null, "(required)"));
  return title;
}
export function createSectionTable(course, sections, choiceType) {
  const table = createElementWithText("div", "section-table", "");
  const header = createElementWithText("div", "section-table-head", "");
  ["Section", "Type", "Time", "Days", "Location", "Instructor"].forEach(
    (label) => header.appendChild(createElementWithText("span", null, label)),
  );
  table.appendChild(header);
  if (sections.length)
    sections.forEach((section) =>
      table.appendChild(renderSectionChoice(course, section, choiceType)),
    );
  else
    table.appendChild(
      createElementWithText("div", "muted-cell", "No sections available"),
    );
  return table;
}
export function updateSearchResultTimeDisplays() {
  document.querySelectorAll(".time-display[data-time]").forEach((element) => {
    element.textContent = formatMeetingListForDisplay(
      element.getAttribute("data-time"),
    );
  });
}
export function renderCourseResults(courses) {
  const results = document.getElementById("searchResults");
  if (!results) return;
  results.replaceChildren();
  if (!courses.length) {
    results.appendChild(
      createElementWithText("div", "empty-search", "No courses found."),
    );
    return;
  }
  const accordion = createElementWithText(
    "div",
    "course-results-accordion",
    "",
  );
  accordion.id = "courseResultsAccordion";
  courses.forEach((course) =>
    accordion.appendChild(renderCourseResult(course)),
  );
  results.appendChild(accordion);
  updateSearchResultTimeDisplays();
}
export function searchHasCriteria(formData) {
  return (
    String(formData.get("q") || "").trim() || getActiveFilterGroupCount() > 0
  );
}
export async function handleCourseSearch(form) {
  const results = document.getElementById("searchResults");
  const requestId = ++courseSearchRequestId;
  const formData = new FormData(form);
  const campus = formData.get("campus");
  const term = formData.get("semester");
  if (!campus || !term) {
    if (results)
      results.replaceChildren(
        createElementWithText(
          "div",
          "empty-search",
          "Choose a campus + term to begin searching courses.",
        ),
      );
    return;
  }
  if (results)
    results.replaceChildren(
      createElementWithText("div", "empty-search", "Loading courses..."),
    );
  try {
    const courses = await CourseApi.fetchCourses(campus, term);
    if (requestId !== courseSearchRequestId) return;
    populateCourseFilterOptions();
    const filterToggle = document.getElementById("filterToggle");
    if (filterToggle) filterToggle.disabled = false;
    if (!searchHasCriteria(formData)) {
      if (results)
        results.replaceChildren(
          createElementWithText(
            "div",
            "empty-search",
            "Start typing or open Filters to find courses.",
          ),
        );
      return;
    }
    renderCourseResults(
      CourseApi.filterCourses(courses, {
        q: formData.get("q"),
        ...courseFilters,
      }),
    );
  } catch (error) {
    if (requestId !== courseSearchRequestId) return;
    if (results)
      results.replaceChildren(
        createElementWithText(
          "div",
          "empty-search",
          "Unable to load courses. Please try again.",
        ),
      );
    console.error("Unable to load course data:", error);
  }
}
export async function handleCourseSearchSubmit(event) {
  event.preventDefault();
  return handleCourseSearch(event.currentTarget);
}
export function findSelectedCourseChoice(courseId, choiceType) {
  return document.querySelector(
    `.section-choice[data-course-id="${courseId}"][data-choice-type="${choiceType}"]:checked`,
  );
}
export function updateCourseAddButton(courseId) {
  const addButton = document.querySelector(
    `.add-course-selection-btn[data-course-id="${courseId}"]`,
  );
  if (!addButton) return;
  const requiresLab = addButton.getAttribute("data-requires-lab") === "true";
  addButton.disabled = !(
    findSelectedCourseChoice(courseId, "lecture") &&
    (!requiresLab || findSelectedCourseChoice(courseId, "lab"))
  );
}
export function buildCourseDataFromChoice(choice, scheduleGroupId) {
  return CourseApi.toScheduleEntry(
    {
      section_id: choice.getAttribute("data-section-id"),
      term_slug: choice.getAttribute("data-term-slug"),
      course_code: choice.getAttribute("data-course-code"),
      course_name: choice.getAttribute("data-course-name"),
      section_num: choice.getAttribute("data-section-num"),
      instructor: choice.getAttribute("data-instructor"),
      location: choice.getAttribute("data-location"),
      days: choice.getAttribute("data-days"),
      time: choice.getAttribute("data-time"),
      seats: choice.getAttribute("data-seats"),
      credits: choice.getAttribute("data-credits") || "0",
      is_lab: choice.getAttribute("data-is-lab") === "true",
      component: choice.getAttribute("data-component") || "lecture",
    },
    scheduleGroupId,
  );
}
export function showSectionGhost(row) {
  const choice = row.querySelector(".section-choice");
  if (!choice) return;
  callbacks.onClearPreview();
  callbacks.onPreview(buildCourseDataFromChoice(choice, "preview"));
}
export function handleAddCourseSelection(button, event) {
  event.preventDefault();
  const courseId = button.getAttribute("data-course-id");
  const requiresLab = button.getAttribute("data-requires-lab") === "true";
  const lectureChoice = findSelectedCourseChoice(courseId, "lecture");
  const labChoice = findSelectedCourseChoice(courseId, "lab");
  if (!lectureChoice || (requiresLab && !labChoice)) return;
  const choices = [lectureChoice, labChoice].filter(Boolean);
  const scheduleGroupId = choices
    .map((choice) => choice.getAttribute("data-section-id"))
    .join("-");
  callbacks.onAddEntries(
    choices.map((choice) => buildCourseDataFromChoice(choice, scheduleGroupId)),
  );
}

export function initializeCourseSearch(options) {
  callbacks = options;
  const form = document.getElementById("courseSearchForm");
  if (form) {
    form.addEventListener("submit", handleCourseSearchSubmit);
    const autoSearch = debounce(
      () => handleCourseSearch(form),
      AUTO_SEARCH_DELAY_MS,
    );
    form.querySelector("#searchInput").addEventListener("input", autoSearch);
    form.querySelectorAll("#campusFilter, #semesterFilter").forEach((select) =>
      select.addEventListener("change", () => {
        resetCourseFilters(true);
        closeCourseFilters();
        document.getElementById("filterToggle").disabled = true;
        autoSearch();
      }),
    );
    form.autoSearch = autoSearch;
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest("#filterToggle")) {
      if (areCourseFiltersOpen()) closeCourseFilters();
      else openCourseFilters();
      return;
    }
    if (event.target.closest("[data-close-filters]")) {
      closeCourseFilters();
      return;
    }
    if (event.target.closest("[data-clear-filters]")) {
      resetCourseFilters(true);
      handleCourseSearch(document.getElementById("courseSearchForm"));
      return;
    }
    if (
      isDesktopFilterOpen() &&
      !event.target.closest("#desktopFilterPopover, #filterToggle")
    )
      closeCourseFilters();
    const addButton = event.target.closest(".add-course-selection-btn");
    if (addButton) handleAddCourseSelection(addButton, event);
  });
  document.addEventListener("change", (event) => {
    const filterControl = event.target.closest(".course-filter-control");
    if (filterControl) {
      updateCourseFiltersFromControl(filterControl);
      syncCourseFilterControls();
      if (form && form.autoSearch) form.autoSearch();
      return;
    }
    const sectionChoice = event.target.closest(".section-choice");
    if (sectionChoice)
      updateCourseAddButton(sectionChoice.getAttribute("data-course-id"));
  });
  document.addEventListener("mouseover", (event) => {
    const row = event.target.closest(".section-choice-row");
    if (row && !row.contains(event.relatedTarget)) showSectionGhost(row);
  });
  document.addEventListener("mouseout", (event) => {
    const row = event.target.closest(".section-choice-row");
    if (row && !row.contains(event.relatedTarget)) callbacks.onClearPreview();
  });
  document.addEventListener("focusin", (event) => {
    const row = event.target.closest(".section-choice-row");
    if (row) showSectionGhost(row);
  });
  document.addEventListener("focusout", (event) => {
    const row = event.target.closest(".section-choice-row");
    if (row && !row.contains(event.relatedTarget)) callbacks.onClearPreview();
  });
  document.body.addEventListener("htmx:afterSwap", (event) => {
    if (event.target && event.target.id === "searchResults") {
      callbacks.onClearPreview();
      updateSearchResultTimeDisplays();
    }
  });
}
