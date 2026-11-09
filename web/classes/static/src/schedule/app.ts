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

function getEventElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
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
      const result = await hydrateSchedule((termSlug) => window.CourseApi.fetchDatasetByKey(termSlug));
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
    const miscToggle = target.closest<HTMLElement>("#mobileMiscToggle");
    if (miscToggle) {
      openMobileMiscSheet(miscToggle);
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
      updateMobileImageExportVisibility();
      if (!isMobileViewport()) closeCourseFilters();
      refreshSchedule();
    }, 150),
  );

  hydrateActiveSchedule();
}
