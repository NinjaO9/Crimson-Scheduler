/**
 * @fileoverview Builds course search results, filters, and section selection controls.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { createElementWithText } from "./dom.js";
import { debounce, isMobileViewport } from "./responsive.js";
import { formatMeetingListForDisplay } from "./time-and-meetings.js";
import { uses24HourTime } from "./preferences.js";
import {
  fetchCourseInformation,
  renderCourseInformation,
} from "./course-information.js";

let courseSearchRequestId = 0;
let courseFilters = createEmptyCourseFilters();
let mobileFilterCloseTimer = null;
let callbacks = {};
let searchableSectionsByKey = new Map();
let activeCourseInfoTrigger = null;
const AUTO_SEARCH_DELAY_MS = 250;

/**
 * Creates the empty filter state used by the course-search UI.
 *
 * @returns {{availability: string[], delivery: string[], ucore: string[], days: string[], startTimeBands: string[]}}
 *   A filter object with one array for each supported filter group.
 */
export function createEmptyCourseFilters() {
  return {
    availability: [],
    delivery: [],
    ucore: [],
    days: [],
    startTimeBands: [],
  };
}

/**
 * Counts filter groups that currently contain at least one selected value.
 *
 * @returns {number} The number of non-empty groups in the module filter state.
 * @see {@link resetCourseFilters}
 * @see {@link syncCourseFilterControls}
 */
export function getActiveFilterGroupCount() {
  return Object.values(courseFilters)
  .filter((values) => values.length > 0)
  .length;
}

/**
 * Clears selected course filters and optionally clears the search query.
 * Cancels the debounced search installed by {@link initializeCourseSearch},
 * then synchronizes the rendered checkbox controls with the new state.
 *
 * @param {boolean} [clearQuery=false] - Whether to empty the course search input.
 * @returns {void}
 * @see {@link createEmptyCourseFilters}
 * @see {@link syncCourseFilterControls}
 */
export function resetCourseFilters(clearQuery) {
  const form = document.getElementById("courseSearchForm");
  if (form && form.autoSearch && form.autoSearch.cancel)
    form.autoSearch.cancel();
  courseFilters = createEmptyCourseFilters();
  if (clearQuery && form) form.querySelector("#searchInput").value = "";
  syncCourseFilterControls();
}

/**
 * Applies one checkbox change to the corresponding filter array.
 *
 * @param {HTMLInputElement} control A checked or unchecked filter checkbox carrying a `data-filter-name` attribute.
 * @returns {void}
 * @see {@link syncCourseFilterControls}
 */
export function updateCourseFiltersFromControl(control) {
  const filterName = control.getAttribute("data-filter-name");
  const values = new Set(courseFilters[filterName]);
  if (control.checked) values.add(control.value);
  else values.delete(control.value);
  courseFilters[filterName] = [...values];
}

/**
 * Synchronizes filter checkbox state and the visible selected-group count.
 * Reads the module-level filter state after {@link updateCourseFiltersFromControl}
 * or {@link resetCourseFilters} changes it.
 *
 * @returns {void}
 * @see {@link getActiveFilterGroupCount}
 */
export function syncCourseFilterControls() {
  document
    .querySelectorAll('.course-filter-control[data-filter-name]')
    .forEach((input) => {
      const filterName = input.getAttribute("data-filter-name");
      input.checked = courseFilters[filterName].includes(input.value);
    });

  const count = getActiveFilterGroupCount();
  const countElement = document.getElementById("filterCount");
  
  if (countElement) {
    countElement.textContent = `· ${count}`;
    countElement.hidden = count === 0;
  }
}

/**
 * Rebuilds all filter checkbox groups, including localized time-band labels.
 * Delegates checkbox creation to {@link populateFilterCheckboxes} and uses
 * the current preference from {@link uses24HourTime} for time descriptions.
 *
 * @returns {void}
 */
export function populateCourseFilterOptions() {
  
  // Populate availability filter
  populateFilterCheckboxes("availability", [
    {value: "openOnly", label: "Only open classes"},
  ]);

  // Populate delivery filter
  populateFilterCheckboxes("delivery", [
    { value: "in-person", label: "In person" },
    { value: "arranged", label: "Arranged" },
  ]);

  // Populate day filter
  populateFilterCheckboxes("days", [
    { value: "M", label: "Monday" },
    { value: "T", label: "Tuesday" },
    { value: "W", label: "Wednesday" },
    { value: "R", label: "Thursday" },
    { value: "F", label: "Friday" },
    { value: "S", label: "Saturday" },
    { value: "U", label: "Sunday" },
  ]);

  // Populate time filter
  populateFilterCheckboxes("startTimeBands", [
    { value: "morning", label: "Morning", description: uses24HourTime() ? "Before 12:00" : "Before 12:00 PM" },
    { value: "afternoon", label: "Afternoon", description: uses24HourTime() ? "12:00 – 16:59" : "12:00 PM – 4:59 PM" },
    { value: "evening", label: "Evening", description: uses24HourTime() ? "17:00 – 20:59" : "5:00 PM – 8:59 PM" },
    { value: "night", label: "Night", description: uses24HourTime() ? "21:00+" : "9:00 PM+" },
  ]);

  // Populate UCORE filter
  populateFilterCheckboxes("ucore", [
    {value: "ANY", label: "Any"},
    {value: "ROOT", label: "ROOT"},
    {value: "COMM", label: "COMM"},
    {value: "QUAN", label: "QUAN"},
    {value: "WRTG", label: "WRTG"},
    {value: "ARTS", label: "ARTS"},
    {value: "BSCI", label: "BSCI"},
    {value: "DIVR", label: "DIVR"},
    {value: "EQJS", label: "EQJS"},
    {value: "HUM", label: "HUM"},
    {value: "SSCI", label: "SSCI"},
    {value: "CAPS", label: "CAPS"},
  ]);

  syncCourseFilterControls();
}

/**
 * Replaces every container for a filter group with generated checkbox labels.
 *
 * @param {string} filterName - The `data-filter-options`/`data-filter-name` value shared by the checkbox group.
 * @param {{value: string, label: string, description?: string}[]} options - Checkbox values and display text for the group.
 * @returns {void}
 * @see {@link createElementWithText}
 * @see {@link populateCourseFilterOptions}
 */
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
          const text = document.createElement("span");
          text.className = "filter-check-text";
          text.appendChild(document.createTextNode(option.label));
          if (option.description)
            text.appendChild(createElementWithText("small", null, option.description));
          label.append(input, text);
          return label;
        }),
      ),
    );
}

/**
 * Opens the responsive course-filter UI and moves focus into it.
 * Mobile uses an inert, aria-managed bottom sheet; desktop uses the filter
 * popover. The paired {@link closeCourseFilters} function restores state.
 *
 * @returns {void}
 * @see {@link isMobileViewport}
 * @see {@link closeCourseFilters}
 */
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
    sheet.inert = false;
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

/**
 * Closes both filter presentations and restores focus when appropriate.
 * Mobile sheet hiding is delayed briefly so its closing transition can finish.
 *
 * @returns {void}
 * @see {@link openCourseFilters}
 * @see {@link areCourseFiltersOpen}
 */
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
    sheet.inert = true;
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

/**
 * Reports whether the desktop filter popover is currently visible.
 *
 * @returns {boolean} `true` when the desktop popover exists and is not hidden.
 */
export function isDesktopFilterOpen() {
  const popover = document.getElementById("desktopFilterPopover");
  return !!popover && !popover.hidden;
}

/**
 * Reports whether either the desktop popover or mobile filter sheet is open.
 *
 * @returns {boolean} `true` when a filter surface is visibly open.
 * @see {@link isDesktopFilterOpen}
 */
export function areCourseFiltersOpen() {
  const sheet = document.getElementById("mobileFilterSheet");
  return (
    isDesktopFilterOpen() || !!(sheet && sheet.classList.contains("is-open"))
  );
}

/**
 * Renders one selectable lecture or lab section row.
 * Stores course/section metadata on the radio input so delegated handlers can preview a section and build a schedule selection later.
 *
 * @param {Object} course - Course record containing at least `id` and `term_slug`.
 * @param {Object} section - Section record containing section, meeting, and seat data.
 * @param {string} choiceType - Radio-group type, normally `lecture` or `lab`.
 * @returns {HTMLLabelElement} The labeled radio row appended by the caller.
 * @see {@link createSectionTable}
 * @see {@link getSectionFromChoice}
 */
export function renderSectionChoice(course, section, choiceType) {
  const sectionId = String(
    section.section_id === null || section.section_id === undefined
      ? ""
      : section.section_id,
  );
  const courseId = String(
    course.id === null || course.id === undefined ? "" : course.id,
  );
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
    ["data-section-key", section.section_key || `${course.term_slug}:${sectionId}`],
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
  const openSeats = Number.isFinite(section.seats_available)
    ? String(section.seats_available)
    : "N/A";
  row.append(
    select,
    createElementWithText("span", null, openSeats),
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

/**
 * Builds an accordion card for one course and all of its section choices.
 * It composes {@link createSectionGroupTitle}, {@link createSectionTable}, and the course-info trigger consumed by the delegated listeners in {@link initializeCourseSearch}.
 *
 * @param {Object} course - Course record with lecture/lab sections and course metadata.
 * @returns {HTMLElement} The complete course result article.
 */
export function renderCourseResult(course) {
  const hasLab = course.lab_sections.length > 0;
  const article = document.createElement("article");
  article.className = "result-card";
  const header = document.createElement("div");
  header.className = "result-summary";
  /*
    Course summary header
  */
  const summary = document.createElement("button");
  summary.className = "result-summary-toggle";
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
  if (course.ucore != '')
  {
    meta.append(
      createElementWithText("span", null, `${course.ucore}`),
    );
  }
  summaryText.append(title, meta);
  summary.append(summaryText, createElementWithText("span", "result-chevron", ""));
  /*
    Additional Information items
  */
  const infoButton = document.createElement("button");
  infoButton.type = "button";
  infoButton.className = "course-info-trigger";
  infoButton.setAttribute("aria-label", `Additional information about ${course.course_code}`);
  infoButton.setAttribute("aria-expanded", "false");
  infoButton.appendChild(createInfoIcon());
  infoButton.courseData = course;
  const infoControl = document.createElement("span");
  infoControl.className = "course-info-control";
  const tooltip = document.createElement("div");
  tooltip.className = "course-info-popover";
  tooltip.setAttribute("role", "dialog");
  tooltip.setAttribute("aria-label", `Additional information about ${course.course_code}`);
  tooltip.hidden = true;
  tooltip.appendChild(createElementWithText("p", "course-info-loading", "Loading additional information…"));
  infoControl.append(infoButton, tooltip);
  header.append(summary, infoControl);
  /*
    Lecture/Lab section accordian
  */
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
  article.append(header, panel);
  return article;
}

const INFO_ICON_PATH = "M8,0a8,8 0 1 0 0 16A8,8 0 0 0 8,0Zm0 14.25A6.25 6.25 0 1 1 8 1.75a6.25 6.25 0 0 1 0 12.5ZM7 7h2v5H7V7Zm0-3h2v2H7V4Z";

/**
 * Creates the decorative SVG information icon used by course-info buttons.
 *
 * @returns {SVGElement} An accessible-hidden SVG icon.
 */
function createInfoIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", INFO_ICON_PATH);
  icon.appendChild(path);
  return icon;
}

/**
 * Inserts fetched course information into the desktop popover and, when the same trigger is active, the mobile information sheet.
 *
 * @param {HTMLElement} trigger - Course-info button whose request produced `info`.
 * @param {Object} info - Course-information payload accepted by {@link renderCourseInformation}.
 * @returns {void}
 * @see {@link loadCourseInfo}
 */
function setCourseInfoContent(trigger, info) {
  const popover = trigger.closest(".course-info-control")?.querySelector(".course-info-popover");
  if (popover) {
    popover.replaceChildren(renderCourseInformation(info));
  }
  const sheetDetails = document.querySelector("#mobileCourseInfoSheet .mobile-course-info-details");
  if (sheetDetails && activeCourseInfoTrigger === trigger) sheetDetails.replaceChildren(renderCourseInformation(info));
}

/**
 * Fetches and renders additional information for a course-info trigger.
 * Guards against duplicate requests and ignores results for a trigger removed
 * from the document while {@link fetchCourseInformation} was pending.
 *
 * @param {HTMLElement} trigger - Course-info button with a `courseData` property.
 * @returns {Promise<void>} Resolves after the response has been rendered.
 * @see {@link openMobileCourseInfoSheet}
 * @see {@link showDesktopCourseInfo}
 */
async function loadCourseInfo(trigger) {
  if (!trigger || trigger.courseInfoLoading) return;
  trigger.courseInfoLoading = true;
  const info = await fetchCourseInformation(trigger.courseData);
  if (document.contains(trigger)) setCourseInfoContent(trigger, info);
  trigger.courseInfoLoading = false;
}

/**
 * Opens the mobile course-information sheet for a result-card trigger.
 * Displays a loading state, manages inert/ARIA state and focus, then delegates
 * the request to {@link loadCourseInfo}.
 *
 * @param {HTMLElement} trigger - Course-info button whose `courseData` is loaded.
 * @returns {void}
 * @see {@link closeMobileCourseInfoSheet}
 */
function openMobileCourseInfoSheet(trigger) {
  const sheet = document.getElementById("mobileCourseInfoSheet");
  const details = sheet && sheet.querySelector(".mobile-course-info-details");
  if (!sheet || !details) return;
  activeCourseInfoTrigger = trigger;
  details.replaceChildren(createElementWithText("p", "course-info-loading", "Loading additional information…"));
  sheet.hidden = false;
  sheet.inert = false;
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("mobile-course-info-sheet-open");
  window.requestAnimationFrame(() => sheet.classList.add("is-open"));
  const closeButton = sheet.querySelector("[data-close-course-info]");
  if (closeButton) closeButton.focus({ preventScroll: true });
  loadCourseInfo(trigger);
}

/**
 * Closes the mobile course-information sheet and optionally returns focus to the trigger that opened it.
 *
 * @param {{restoreFocus?: boolean}} [options={}] - Close behavior options.
 * @param {boolean} [options.restoreFocus=true] - Whether to focus the originating trigger.
 * @returns {void}
 * @see {@link openMobileCourseInfoSheet}
 */
export function closeMobileCourseInfoSheet({ restoreFocus = true } = {}) {
  const sheet = document.getElementById("mobileCourseInfoSheet");
  if (!sheet || !sheet.classList.contains("is-open")) return;
  sheet.classList.remove("is-open");
  sheet.inert = true;
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("mobile-course-info-sheet-open");
  window.setTimeout(() => { if (!sheet.classList.contains("is-open")) sheet.hidden = true; }, 180);
  if (restoreFocus && activeCourseInfoTrigger && document.contains(activeCourseInfoTrigger)) activeCourseInfoTrigger.focus({ preventScroll: true });
  activeCourseInfoTrigger = null;
}

/**
 * Reveals a desktop course-info popover and starts its data request.
 * Mobile callers use {@link openMobileCourseInfoSheet} instead.
 *
 * @param {HTMLElement} trigger - Course-info button associated with the popover.
 * @returns {void}
 * @see {@link hideDesktopCourseInfo}
 * @see {@link loadCourseInfo}
 */
function showDesktopCourseInfo(trigger) {
  const popover = trigger.closest(".course-info-control")?.querySelector(".course-info-popover");
  if (!popover || isMobileViewport()) return;
  popover.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  loadCourseInfo(trigger);
}

/**
 * Hides a desktop info popover when neither it nor its control retains focus.
 * This hover/focus guard prevents the delegated mouse and focus listeners from closing the popover while the user is interacting with it.
 *
 * @param {HTMLElement} trigger - Course-info button associated with the popover.
 * @returns {void}
 * @see {@link showDesktopCourseInfo}
 */
function hideDesktopCourseInfo(trigger) {
  const control = trigger && trigger.closest(".course-info-control");
  const popover = control && control.querySelector(".course-info-popover");
  if (!popover || control.matches(":focus-within") || popover.matches(":hover")) return;
  popover.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

/**
 * Immediately closes the desktop info popover for a trigger.
 *
 * @param {HTMLElement} trigger - Course-info button associated with the popover.
 * @returns {void}
 * @see {@link showDesktopCourseInfo}
 */
function closeDesktopCourseInfo(trigger) {
  const popover = trigger && trigger.closest(".course-info-control")?.querySelector(".course-info-popover");
  if (!popover) return;
  popover.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

/**
 * Creates a heading for a lecture or lab section group.
 *
 * @param {string} label - Heading text shown to the user.
 * @param {boolean} required - Whether to append the `(required)` indicator.
 * @param {string} [className] - Optional additional CSS class.
 * @returns {HTMLDivElement} The section-group heading element.
 * @see {@link createSectionTable}
 */
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

/**
 * Creates the section table header and renders each selectable section row.
 * Delegates row construction to {@link renderSectionChoice}; an empty list
 * produces a localized empty-state message instead.
 *
 * @param {Object} course - Course record owning the sections.
 * @param {Object[]} sections - Lecture or lab section records.
 * @param {string} choiceType - Radio-group type passed to each row.
 * @returns {HTMLDivElement} The section table container.
 */
export function createSectionTable(course, sections, choiceType) {
  const table = createElementWithText("div", "section-table", "");
  table.tabIndex = 0;
  table.setAttribute(
    "aria-label",
    `${choiceType === "lab" ? "Lab" : "Lecture"} section results`,
  );
  const header = createElementWithText("div", "section-table-head", "");
  ["Section", "O. Seats", "Time", "Days", "Location", "Instructor"].forEach(
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

/**
 * Re-formats rendered meeting times according to the active time preference.
 * Operates on the `data-time` values emitted by {@link renderSectionChoice}.
 *
 * @returns {void}
 * @see {@link formatMeetingListForDisplay}
 */
export function updateSearchResultTimeDisplays() {
  document.querySelectorAll(".time-display[data-time]").forEach((element) => {
    element.textContent = formatMeetingListForDisplay(
      element.getAttribute("data-time"),
    );
  });
}

/**
 * Replaces the search-results region with course cards or an empty state.
 * Indexes sections by key before rendering so {@link getSectionFromChoice}
 * can recover the original section object when a user previews or adds it.
 *
 * @param {Object[]} courses - Course records returned by the search API.
 * @returns {void}
 * @see {@link renderCourseResult}
 * @see {@link updateSearchResultTimeDisplays}
 */
export function renderCourseResults(courses) {
  const results = document.getElementById("searchResults");
  if (!results) return;
  searchableSectionsByKey = new Map();
  courses.forEach((course) => {
    // Keep the original section records available after the DOM is rebuilt.
    [...course.lecture_sections, ...course.lab_sections].forEach((section) => {
      const key = section.section_key || `${course.term_slug}:${section.section_id}`;
      searchableSectionsByKey.set(key, section);
    });
  });
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

/**
 * Determines whether a search should be filtered and rendered.
 * A non-blank query or at least one selected filter group is sufficient.
 *
 * @param {FormData} formData - Search form data containing the `q` field.
 * @returns {boolean|string} The trimmed query string when present; otherwise a boolean indicating whether any filter group is active.
 * @see {@link getActiveFilterGroupCount}
 */
export function searchHasCriteria(formData) {
  return (
    String(formData.get("q") || "").trim() || getActiveFilterGroupCount() > 0
  );
}

/**
 * Fetches, filters, and renders courses for the current search form.
 * Uses {@link CourseApi.fetchCourses} and {@link CourseApi.filterCourses}
 *
 * @param {HTMLFormElement} form - Course-search form containing campus, semester, query, and filter controls.
 * @returns {Promise<void>} Resolves after the result state has been updated.
 * @see {@link handleCourseSearchSubmit}
 * @see {@link renderCourseResults}
 */
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
    // A newer campus/term/query change wins over this response.
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

/**
 * Prevents native form navigation and delegates the submit to {@link handleCourseSearch}.
 *
 * @param {SubmitEvent} event - Course-search form submit event.
 * @returns {Promise<void>} The delegated search promise.
 */
export async function handleCourseSearchSubmit(event) {
  event.preventDefault();
  return handleCourseSearch(event.currentTarget);
}

/**
 * Finds the checked lecture or lab radio for a rendered course card.
 *
 * @param {string|number} courseId - Course identifier stored on the radio.
 * @param {string} choiceType - Choice group, such as `lecture` or `lab`.
 * @returns {HTMLInputElement|null} The checked choice, or `null` if none exists.
 * @see {@link updateCourseAddButton}
 */
export function findSelectedCourseChoice(courseId, choiceType) {
  return document.querySelector(
    `.section-choice[data-course-id="${courseId}"][data-choice-type="${choiceType}"]:checked`,
  );
}

/**
 * Enables a course card's add button only when required section choices exist.
 * Uses {@link findSelectedCourseChoice} for the lecture and optional lab.
 *
 * @param {string|number} courseId - Course identifier on the result card.
 * @returns {void}
 * @see {@link handleAddCourseSelection}
 */
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

/**
 * Resolves a radio choice to its indexed section and assigns a schedule group.
 * The returned copy is safe for preview/add callbacks to augment independently.
 *
 * @param {HTMLInputElement} choice - Section radio carrying `data-section-key`.
 * @param {string} [scheduleGroupId] - Group identifier shared by linked choices.
 * @returns {Object|null} Section data with `schedule_group_id`, or `null` when the key is no longer indexed.
 * @see {@link renderCourseResults}
 * @see {@link handleAddCourseSelection}
 */
export function getSectionFromChoice(choice, scheduleGroupId) {
  const sectionKey = choice.getAttribute("data-section-key");
  const section = searchableSectionsByKey.get(sectionKey);
  if (!section) return null;
  return { ...section, schedule_group_id: scheduleGroupId || null };
}

/**
 * Clears the existing preview and asks the host to preview a hovered/focused row.
 * Uses the module callbacks installed by {@link initializeCourseSearch}.
 *
 * @param {HTMLElement} row - Section-choice row containing a radio input.
 * @returns {void}
 * @see {@link getSectionFromChoice}
 */
export function showSectionGhost(row) {
  const choice = row.querySelector(".section-choice");
  if (!choice) return;
  callbacks.onClearPreview();
  const section = getSectionFromChoice(choice, "preview");
  if (section) callbacks.onPreview(section);
}

/**
 * Collects selected lecture/lab choices and sends them to the schedule host.
 * The callback receives section copies sharing a generated schedule-group ID.
 *
 * @param {HTMLButtonElement} button - Add button carrying course/lab metadata.
 * @param {MouseEvent|KeyboardEvent} event - Activating event whose default is canceled.
 * @returns {void}
 * @see {@link findSelectedCourseChoice}
 * @see {@link getSectionFromChoice}
 */
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
  const sections = choices
    .map((choice) => getSectionFromChoice(choice, scheduleGroupId))
    .filter(Boolean);
  if (sections.length) callbacks.onAddSections(sections, scheduleGroupId);
}

/**
 * Installs course-search form behavior and delegated result interactions.
 * Registers debounced searching, responsive filter/info controls, section previews, and HTMX result-refresh handling.
 * Callback functions supplied here connect this module to the schedule preview/add workflow.
 *
 * @param {{onClearPreview: Function, onPreview: Function, onAddSections: Function}} options - Host callbacks used by {@link showSectionGhost} and {@link handleAddCourseSelection}.
 * @returns {void}
 * @see {@link debounce}
 * @see {@link handleCourseSearchSubmit}
 */
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
    const infoTrigger = event.target.closest(".course-info-trigger");
    if (infoTrigger) {
      event.preventDefault();
      event.stopPropagation();
      if (isMobileViewport()) openMobileCourseInfoSheet(infoTrigger);
      else {
        const expanded = infoTrigger.getAttribute("aria-expanded") === "true";
        if (expanded) hideDesktopCourseInfo(infoTrigger);
        else showDesktopCourseInfo(infoTrigger);
      }
      return;
    }
    if (event.target.closest("[data-close-course-info]")) {
      closeMobileCourseInfoSheet();
      return;
    }
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
    if (event.target.closest("#timeFormatToggle")) {
      populateCourseFilterOptions();
      return;
    }
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
    const infoControl = event.target.closest(".course-info-control");
    const infoTrigger = infoControl && infoControl.querySelector(".course-info-trigger");
    if (infoTrigger && !isMobileViewport() && !infoControl.contains(event.relatedTarget)) {
      showDesktopCourseInfo(infoTrigger);
    }
  });
  document.addEventListener("mouseout", (event) => {
    const row = event.target.closest(".section-choice-row");
    if (row && !row.contains(event.relatedTarget)) callbacks.onClearPreview();
    const infoControl = event.target.closest(".course-info-control");
    const infoTrigger = infoControl && infoControl.querySelector(".course-info-trigger");
    if (infoTrigger && !infoControl.contains(event.relatedTarget)) {
      window.setTimeout(() => hideDesktopCourseInfo(infoTrigger), 0);
    }
  });
  document.addEventListener("focusin", (event) => {
    const row = event.target.closest(".section-choice-row");
    if (row) showSectionGhost(row);
    const infoTrigger = event.target.closest(".course-info-trigger");
    if (infoTrigger && !isMobileViewport()) showDesktopCourseInfo(infoTrigger);
  });
  document.addEventListener("focusout", (event) => {
    const row = event.target.closest(".section-choice-row");
    if (row && !row.contains(event.relatedTarget)) callbacks.onClearPreview();
    const infoControl = event.target.closest(".course-info-control");
    const infoTrigger = infoControl && infoControl.querySelector(".course-info-trigger");
    if (infoTrigger) window.setTimeout(() => hideDesktopCourseInfo(infoTrigger), 0);
  });
  document.body.addEventListener("htmx:afterSwap", (event) => {
    if (event.target && event.target.id === "searchResults") {
      callbacks.onClearPreview();
      updateSearchResultTimeDisplays();
    }
  });
}
