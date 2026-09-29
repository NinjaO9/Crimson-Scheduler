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
  initializeScheduleName,
  initializeScheduleOptions,
  normalizeScheduleNameInput,
  saveScheduleName,
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
import { initializeCalendarExport } from "./export-schedule.js";
import { initializeCatalogFreshness } from "./catalog-freshness.js";

export function initializeScheduleApp() {
  initializeCatalogFreshness();
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
      if (removeScheduleEntry(removeMiscButton.getAttribute("data-section-id")))
        refreshSchedule();
      return;
    }
    if (event.target.closest("#exportScheduleBtn")) return exportSchedule();
    if (event.target.closest("#exportCalendarBtn")) return exportCalendar();
    if (event.target.closest("#shareScheduleBtn"))
      return sharing.shareScheduleCode();
    if (event.target.closest("#importShareCodeBtn"))
      return sharing.importScheduleFromShareCode();
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
      if (!isMobileViewport()) closeCourseFilters();
      refreshSchedule();
    }, 150),
  );
  refreshSchedule();
}
