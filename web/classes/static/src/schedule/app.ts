/**
 * @fileoverview Coordinates schedule builder initialization and application events.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import {
  clearSectionGhosts,
  closeMobileConflictSheet,
  closeMobileCourseSheet,
  removeActiveMobileCourse,
  renderSchedule,
  renderSectionGhost,
} from "./calendar.js";
import {
  closeCourseFilters,
  initializeCourseSearch,
  updateSearchResultTimeDisplays,
} from "./course-search.js";
import {
  getRateLimitMessageFromResponse,
  showRateLimitToast,
} from "./notifications.js";
import {
  getScheduleName,
  initializeScheduleOptions,
  normalizeScheduleNameInput,
  saveScheduleOptions,
} from "./preferences.js";
import {
  debounce,
  closeMobileGeneratorSelection,
  closeMobileCombinationsSheet,
  closeMobileMiscSheet,
  handleMobileNavigation,
  initializeMobileLayout,
  isMobileViewport,
  openMobileGeneratorSelection,
  openMobileCombinationsSheet,
  openMobileMiscSheet,
  setMobilePane,
  syncMobileGeneratorSelection,
  syncMobileCombinations,
  syncMobileMiscPanel,
  updateMobileImageExportVisibility,
} from "./responsive.js";
import {
  addSchedule,
  addSectionSelection,
  clearSchedule,
  getActiveSchedule,
  getSchedule,
  getSchedules,
  hydrateSchedule,
  initializeScheduleState,
  removeScheduleEntry,
  removeScheduleReferences,
  replaceSchedule,
} from "./schedule-state.js";
import {
  initializeScheduleSelector,
  refreshScheduleSelector,
  setScheduleSelectorName,
} from "./schedule-selector.js";
import { initializeScheduleExport } from "./export-image.js";
import { initializeScheduleSharing } from "./sharing.js";
import { initializeCalendarExport } from "./export-schedule.js";
import { initializeCatalogFreshness } from "./catalog-freshness.js";
import { initializeScheduleViewTabs } from "./schedule-views.js";
import { initializeGeneratorSelection } from "./generator-selection.js";
import { initializeScheduleGeneratorController } from "./generator-results.js";
import { initializeGeneratorWorkflow } from "./generator-workflow.js";
import { initializeGeneratorOptions } from "./generator-options.js";
import { generateSchedules } from "./schedule-generation.js";

function getEventElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

export function shouldRemoveUnavailableCourses(count: number): boolean {
  if (!count) return false;
  return window.confirm(
    `${count} planned course(s) had issues loading. ` +
    "You can keep them in this schedule and try again later, or remove them now. " +
    "Courses that could not load will not appear on the calendar until they load successfully.\n\n" +
    "Choose OK to remove the affected courses, or Cancel to keep them.",
  );
}

/**
 * Initializes the schedule application, including its state, catalog freshness,
 * course search, schedule sharing, and export functionality. Registers event
 * handlers for schedule management, mobile navigation, display options, and
 * keyboard interactions, then hydrates the saved schedule from the course
 * catalog and refreshes the rendered schedule.
 *
 */
export function initializeScheduleApp(): void {
  initializeCatalogFreshness();
  initializeScheduleState();
  initializeScheduleOptions();
  initializeMobileLayout();
  initializeScheduleViewTabs();
  const generatorResults = initializeScheduleGeneratorController({
    onResultSelected: () => closeMobileCombinationsSheet(),
  });
  const generatorOptions = initializeGeneratorOptions();
  let generatorWorkflow: ReturnType<typeof initializeGeneratorWorkflow> | null = null;
  const generatorSelection = initializeGeneratorSelection({
    getActiveSchedule,
    resolveCourse: (termSlug, sectionId) =>
      window.CourseApi.findCourseFromSection(termSlug, sectionId),
    onSelectionChange: () => generatorWorkflow?.selectionChanged(),
  });
  
  generatorWorkflow = initializeGeneratorWorkflow(
    generatorSelection.getCourses,
    generatorResults,
    (courses) => generateSchedules(courses, generatorOptions.getCount()),
  );

  const addGeneratedButton = document.getElementById("addGeneratedScheduleBtn");
  addGeneratedButton?.addEventListener("click", () => {
    const result = generatorResults.getActiveResult();
    if (!result) return;
    const existingNames = new Set(getSchedules().map((schedule) => schedule.name));
    let number = 1;
    while (existingNames.has(`Generated ${number}`)) number += 1;
    const name = `Generated ${number}`;
    const saved = addSchedule(result.sections.map(({ term_slug, section_id, schedule_group_id }) => ({
      term_slug,
      section_id: String(section_id),
      schedule_group_id: schedule_group_id ?? null,
    })), name);
    const status = document.getElementById("addGeneratedScheduleStatus");
    if (saved) refreshScheduleSelector();
    addGeneratedButton.textContent = saved ? "Added to list" : "Could not add";
    window.setTimeout(() => { addGeneratedButton.textContent = "Add Schedule"; }, 2000);
    if (status) status.textContent = saved
      ? `${saved.name} added to your schedule list.`
      : "Unable to add schedule. Please try again.";
  });

  const refreshSchedule = () => {
    renderSchedule(getSchedule(), {
      onRemove: (sectionKey) => {
        if (removeScheduleEntry(sectionKey)) refreshSchedule();
      },
    });
    updateSearchResultTimeDisplays();
    generatorResults.refresh();
  };

  const hydrateActiveSchedule = async () => {
    generatorWorkflow?.selectionChanged();
    const scheduleId = getActiveSchedule()?.id;
    try {
      const result = await hydrateSchedule((termSlug) => window.CourseApi.fetchDatasetByKey(termSlug));
      if (getActiveSchedule()?.id !== scheduleId) return;
      if (shouldRemoveUnavailableCourses(result.unavailableRefs.length)) {
        removeScheduleReferences(result.unavailableRefs.map((reference) =>
          `${reference.term_slug}:${reference.section_id}`));
      }
    } catch (error) {
      console.error("Unable to hydrate saved schedule:", error);
    }
    if (getActiveSchedule()?.id !== scheduleId) return;
    refreshSchedule();
    await generatorSelection.loadFromActiveSchedule();
  };

  initializeScheduleSelector({ onScheduleChange: hydrateActiveSchedule });
  const showSchedulePane = () => {
    if (isMobileViewport()) setMobilePane("schedule");
  };

  initializeCourseSearch({
    onAddSections: (sections, scheduleGroupId) => {
      if (addSectionSelection(sections, scheduleGroupId).length) {
        refreshSchedule();
        showSchedulePane();
      }
    },
    onPreview: renderSectionGhost,
    onClearPreview: clearSectionGhosts,
    onAddGeneratorCourse: generatorSelection.addCourse,
    isGeneratorCourseSelected: generatorSelection.hasCourse,
  });

  const sharing = initializeScheduleSharing({
    getSchedule,
    replaceSchedule,
    getName: getScheduleName,
    setName: (name) => {
      if (name !== undefined) setScheduleSelectorName(name);
      else refreshScheduleSelector();
    },
    refreshSchedule: () => {
      refreshSchedule();
      void generatorSelection.loadFromActiveSchedule();
    },
    showSchedulePane,
  });

  const exportSchedule = initializeScheduleExport({
    getScheduleName,
    normalizeScheduleName: normalizeScheduleNameInput,
    clearSectionGhosts,
  });

  const exportCalendar = initializeCalendarExport({
    getScheduleName,
    normalizeScheduleName: normalizeScheduleNameInput,
    getSchedule,
  });

  document.addEventListener("click", (event) => {
    const target = getEventElement(event);
    if (!target) return;
    if (target.closest("#clearScheduleBtn")) {
      event.preventDefault();
      if (!window.confirm("Clear your entire schedule? This cannot be undone."))
        return;
      clearSchedule();
      refreshSchedule();
      return;
    }

    const removeGeneratorCourseButton = target.closest<HTMLElement>(
      ".remove-generator-course-btn",
    );
    if (removeGeneratorCourseButton) {
      const courseKey = removeGeneratorCourseButton.dataset.courseKey;
      if (courseKey) generatorSelection.removeCourse(courseKey);
      return;
    }

    const removeMiscButton = target.closest<HTMLElement>(".remove-misc-btn");
    if (removeMiscButton) {
      const sectionKey = removeMiscButton.getAttribute("data-section-key") ||
        removeMiscButton.getAttribute("data-section-id");
      if (sectionKey && removeScheduleEntry(sectionKey))
        refreshSchedule();
      return;
    }

    if (target.closest("#exportScheduleBtn")) return exportSchedule();
    if (target.closest("#exportCalendarBtn")) return exportCalendar();
    if (target.closest("#shareScheduleBtn")) return sharing.shareScheduleCode();
    if (target.closest("#importShareCodeBtn")) return sharing.importScheduleFromShareCode();
    if (target.closest("#mobileConflictBackdrop, #mobileConflictClose")) {
      closeMobileConflictSheet();
      return;
    }
    if (target.closest("[data-close-misc]")) {
      closeMobileMiscSheet();
      return;
    }
    if (target.closest("[data-close-generator-selection]")) {
      closeMobileGeneratorSelection();
      return;
    }
    if (target.closest("[data-close-combinations]")) {
      closeMobileCombinationsSheet();
      return;
    }
    const miscToggle = target.closest<HTMLElement>("#mobileMiscToggle");
    if (miscToggle) {
      openMobileMiscSheet(miscToggle);
      return;
    }
    const generatorToggle = target.closest<HTMLElement>("#mobileGeneratorToggle");
    if (generatorToggle) {
      openMobileGeneratorSelection(generatorToggle);
      return;
    }
    const combinationsToggle = target.closest<HTMLElement>("#mobileCombinationsToggle");
    if (combinationsToggle) {
      openMobileCombinationsSheet(combinationsToggle);
      return;
    }
    if (target.closest("[data-close-course]")) {
      closeMobileCourseSheet();
      return;
    }
    if (target.closest("#mobileCourseRemove")) {
      removeActiveMobileCourse();
      return;
    }
    const mobileNavButton = target.closest<HTMLElement>(".mobile-nav-btn");
    if (mobileNavButton) handleMobileNavigation(mobileNavButton);
  });

  document.addEventListener("change", (event) => {
    const target = getEventElement(event);
    if (!target) return;
    if (target.closest("#timeFormatToggle")) {
      saveScheduleOptions();
      refreshSchedule();
      return;
    }
    if (
      target.closest(
        "#hideWeekendsToggle, #showInstructorToggle, #showSectionToggle",
      )
    ) {
      saveScheduleOptions();
      refreshSchedule();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCourseFilters();
      closeMobileConflictSheet();
      closeMobileMiscSheet();
      closeMobileGeneratorSelection();
      closeMobileCombinationsSheet();
      closeMobileCourseSheet();
    }
  });

  document.body.addEventListener("htmx:responseError", (event) => {
    const detail = (event as CustomEvent<{ xhr?: XMLHttpRequest }>).detail;
    const xhr = detail && detail.xhr;
    if (xhr && xhr.status === 429)
      showRateLimitToast(getRateLimitMessageFromResponse(xhr));
  });

  window.addEventListener(
    "resize",
    debounce(() => {
      syncMobileMiscPanel();
      syncMobileGeneratorSelection();
      syncMobileCombinations();
      updateMobileImageExportVisibility();
      if (!isMobileViewport()) closeCourseFilters();
      refreshSchedule();
    }, 150),
  );

  hydrateActiveSchedule();
}
