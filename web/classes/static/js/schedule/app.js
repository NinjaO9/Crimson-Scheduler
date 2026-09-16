import {
  clearSectionGhosts,
  closeMobileConflictSheet,
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
  initializeScheduleName,
  initializeScheduleOptions,
  normalizeScheduleNameInput,
  saveScheduleName,
  saveScheduleOptions,
} from "./preferences.js";
import {
  debounce,
  handleMobileNavigation,
  initializeMobileLayout,
  isMobileViewport,
  setMobilePane,
} from "./responsive.js";
import {
  appendScheduleEntries,
  clearSchedule,
  getSchedule,
  initializeScheduleState,
  removeScheduleEntry,
  replaceSchedule,
} from "./schedule-state.js";
import { initializeScheduleExport } from "./export-image.js";
import { initializeScheduleSharing } from "./sharing.js";

export function initializeScheduleApp() {
  initializeScheduleName();
  initializeScheduleOptions();
  initializeMobileLayout();
  initializeScheduleState();
  const refreshSchedule = () => {
    renderSchedule(getSchedule(), {
      onRemove: (sectionId) => {
        if (removeScheduleEntry(sectionId)) refreshSchedule();
      },
    });
    updateSearchResultTimeDisplays();
  };
  const showSchedulePane = () => {
    if (isMobileViewport()) setMobilePane("schedule");
  };
  initializeCourseSearch({
    onAddEntries: (entries) => {
      if (appendScheduleEntries(entries).length) {
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
      const input = document.getElementById("scheduleNameInput");
      if (name !== undefined && input) input.value = name;
      normalizeScheduleNameInput();
    },
    refreshSchedule,
    showSchedulePane,
  });
  const exportSchedule = initializeScheduleExport({
    getScheduleName,
    normalizeScheduleName: normalizeScheduleNameInput,
    clearSectionGhosts,
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
      if (removeScheduleEntry(removeMiscButton.getAttribute("data-section-id")))
        refreshSchedule();
      return;
    }
    if (event.target.closest("#exportScheduleBtn")) return exportSchedule();
    if (event.target.closest("#shareScheduleBtn"))
      return sharing.shareScheduleCode();
    if (event.target.closest("#importShareCodeBtn"))
      return sharing.importScheduleFromShareCode();
    if (event.target.closest("#mobileConflictBackdrop, #mobileConflictClose")) {
      closeMobileConflictSheet();
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
  document.addEventListener("input", (event) => {
    if (event.target.closest("#scheduleNameInput")) saveScheduleName();
  });
  document.addEventListener(
    "blur",
    (event) => {
      if (event.target.closest("#scheduleNameInput"))
        normalizeScheduleNameInput();
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCourseFilters();
      closeMobileConflictSheet();
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
      if (!isMobileViewport()) closeCourseFilters();
      refreshSchedule();
    }, 150),
  );
  refreshSchedule();
}
