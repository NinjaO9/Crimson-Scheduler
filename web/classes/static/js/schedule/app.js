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
  closeMobileMiscSheet,
  handleMobileNavigation,
  initializeMobileLayout,
  isMobileViewport,
  openMobileMiscSheet,
  setMobilePane,
  syncMobileMiscPanel,
  updateMobileImageExportVisibility,
} from "./responsive.js";
import {
  addSectionSelection,
  clearSchedule,
  getSchedule,
  hydrateSchedule,
  initializeScheduleState,
  removeScheduleEntry,
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

/**
 * Initializes the schedule application, including its state, catalog freshness,
 * course search, schedule sharing, and export functionality. Registers event
 * handlers for schedule management, mobile navigation, display options, and
 * keyboard interactions, then hydrates the saved schedule from the course
 * catalog and refreshes the rendered schedule.
 *
 * @returns {void}
 */
export function initializeScheduleApp() {
  initializeCatalogFreshness();
  initializeScheduleState();
  initializeScheduleOptions();
  initializeMobileLayout();

  const refreshSchedule = () => {
    renderSchedule(getSchedule(), {
      onRemove: (sectionKey) => {
        if (removeScheduleEntry(sectionKey)) refreshSchedule();
      },
    });
    updateSearchResultTimeDisplays();
  };

  const hydrateActiveSchedule = async () => {
    try {
      const result = await hydrateSchedule((termSlug) => CourseApi.fetchDatasetByKey(termSlug),);
      if (result.missingCount)
        window.alert(`Removed ${result.missingCount} planned course(s) that were not found in the current catalog.`);
      if (result.failedCount)
        window.alert(`Failed to load ${result.failedCount} planned course(s).`);
    } catch (error) {
      console.error("Unable to hydrate saved schedule:", error);
    }
    refreshSchedule();
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
  });

  const sharing = initializeScheduleSharing({
    getSchedule,
    replaceSchedule,
    getName: getScheduleName,
    setName: (name) => {
      if (name !== undefined) setScheduleSelectorName(name);
      else refreshScheduleSelector();
    },
    refreshSchedule,
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
    if (event.target.closest("#clearScheduleBtn")) {
      event.preventDefault();
      if (!window.confirm("Clear your entire schedule? This cannot be undone."))
        return;
      clearSchedule();
      refreshSchedule();
      return;
    }

    const removeMiscButton = event.target.closest(".remove-misc-btn");
    if (removeMiscButton) {
      if (
        removeScheduleEntry(
          removeMiscButton.getAttribute("data-section-key") ||
            removeMiscButton.getAttribute("data-section-id"),
        )
      )
        refreshSchedule();
      return;
    }

    if (event.target.closest("#exportScheduleBtn")) return exportSchedule();
    if (event.target.closest("#exportCalendarBtn")) return exportCalendar();
    if (event.target.closest("#shareScheduleBtn")) return sharing.shareScheduleCode();
    if (event.target.closest("#importShareCodeBtn")) return sharing.importScheduleFromShareCode();
    if (event.target.closest("#mobileConflictBackdrop, #mobileConflictClose")) {
      closeMobileConflictSheet();
      return;
    }
    if (event.target.closest("[data-close-misc]")) {
      closeMobileMiscSheet();
      return;
    }
    if (event.target.closest("#mobileMiscToggle")) {
      openMobileMiscSheet(event.target.closest("#mobileMiscToggle"));
      return;
    }
    if (event.target.closest("[data-close-course]")) {
      closeMobileCourseSheet();
      return;
    }
    if (event.target.closest("#mobileCourseRemove")) {
      removeActiveMobileCourse();
      return;
    }
    const mobileNavButton = event.target.closest(".mobile-nav-btn");
    if (mobileNavButton) handleMobileNavigation(mobileNavButton);
  });

  document.addEventListener("change", (event) => {
    if (event.target.closest("#timeFormatToggle")) {
      saveScheduleOptions();
      refreshSchedule();
      return;
    }
    if (
      event.target.closest(
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
      closeMobileCourseSheet();
    }
  });

  document.body.addEventListener("htmx:responseError", (event) => {
    const xhr = event.detail && event.detail.xhr;
    if (xhr && xhr.status === 429)
      showRateLimitToast(getRateLimitMessageFromResponse(xhr));
  });

  window.addEventListener(
    "resize",
    debounce(() => {
      syncMobileMiscPanel();
      updateMobileImageExportVisibility();
      if (!isMobileViewport()) closeCourseFilters();
      refreshSchedule();
    }, 150),
  );

  hydrateActiveSchedule();
}
