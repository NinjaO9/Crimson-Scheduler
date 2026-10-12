/**
 * @fileoverview Handles responsive panes, mobile navigation, and mobile sheets.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { MOBILE_BREAKPOINT } from "./constants.js";

let activeMobileMiscTrigger = null;

/**
 * Checks whether the current viewport is at or below the mobile breakpoint.
 *
 * @returns {boolean} `true` when the mobile layout should be active.
 */
export function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

/**
 * Detects Google Search or Chrome mobile app contexts where image export is unavailable.
 * Requires both a mobile viewport and a supported user-agent signature.
 *
 * @param {string} [userAgent=navigator.userAgent] - User-agent string to inspect.
 * @returns {boolean} `true` when the page is running in a matching mobile app.
 * @see {@link isMobileViewport}
 */
export function isGoogleOrChromeMobileApp(userAgent = navigator.userAgent) {
  if (!isMobileViewport()) return false;
  const ua = String(userAgent || "");
  if (/\bGSA\//i.test(ua)) return true;
  if (!/\b(?:Chrome|CriOS)\//i.test(ua)) return false;
  return !/\b(?:EdgA|EdgiOS|OPR|SamsungBrowser)\//i.test(ua);
}

/**
 * Hides or shows the image-export button based on mobile app support.
 *
 * @returns {void}
 * @see {@link isGoogleOrChromeMobileApp}
 */
export function updateMobileImageExportVisibility() {
  const exportButton = document.getElementById("exportScheduleBtn");
  if (!exportButton) return;
  const hidden = isGoogleOrChromeMobileApp();
  exportButton.hidden = hidden;
  exportButton.setAttribute("aria-hidden", String(hidden));
}

/**
 * Initializes the mobile layout, miscellaneous panel placement, and export visibility.
 *
 * @returns {void}
 * @see {@link setMobilePane}
 * @see {@link syncMobileMiscPanel}
 * @see {@link updateMobileImageExportVisibility}
 */
export function initializeMobileLayout() {
  setMobilePane("search");
  syncMobileMiscPanel();
  updateMobileImageExportVisibility();
}

/**
 * Activates the pane named by a mobile navigation button.
 *
 * @param {HTMLElement} button - Navigation button with a `data-mobile-nav` value.
 * @returns {void}
 * @see {@link setMobilePane}
 */
export function handleMobileNavigation(button) {
  setMobilePane(button.getAttribute("data-mobile-nav"));
}

/**
 * Synchronizes active pane classes, button pressed state, and shell metadata.
 *
 * @param {string} targetPane - Pane identifier to activate.
 * @returns {void}
 */
export function setMobilePane(targetPane) {
  document.querySelectorAll("[data-mobile-pane]").forEach((pane) => {
    pane.classList.toggle(
      "is-active",
      pane.getAttribute("data-mobile-pane") === targetPane,
    );
  });
  document.querySelectorAll(".mobile-nav-btn").forEach((button) => {
    const isActive = button.getAttribute("data-mobile-nav") === targetPane;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  const shell = document.querySelector(".schedule-shell");

  if (shell) shell.setAttribute("data-active-mobile-pane", targetPane);
}

/**
 * Moves the miscellaneous panel between its desktop and mobile hosts.
 *
 * @returns {void}
 * @see {@link isMobileViewport}
 */
export function syncMobileMiscPanel() {
  const panel = document.querySelector(".misc-panel");
  const schedulePane = document.querySelector('.schedule-pane[data-mobile-pane="schedule"]');
  const host = document.getElementById("mobileMiscPanelHost");

  if (!panel || !schedulePane || !host) return;
  if (isMobileViewport()) {
    if (!host.contains(panel)) host.appendChild(panel);
  } else if (!schedulePane.contains(panel)) {
    schedulePane.appendChild(panel);
  }
}

/**
 * Opens the mobile miscellaneous sheet, manages inert/ARIA state, and focuses its panel.
 *
 * @param {HTMLElement} [trigger] - Element that opened the sheet for focus restoration.
 * @returns {void}
 * @see {@link closeMobileMiscSheet}
 */
export function openMobileMiscSheet(trigger) {
  if (!isMobileViewport()) return;

  const sheet = document.getElementById("mobileMiscSheet");
  const toggle = document.getElementById("mobileMiscToggle");

  if (!sheet || !toggle) return;
  activeMobileMiscTrigger = trigger || toggle;
  sheet.hidden = false;
  sheet.inert = false;
  sheet.setAttribute("aria-hidden", "false");
  toggle.setAttribute("aria-expanded", "true");
  document.body.classList.add("mobile-misc-sheet-open");
  window.requestAnimationFrame(() => sheet.classList.add("is-open"));
  const panel = sheet.querySelector(".mobile-misc-panel");
  if (panel) panel.focus({ preventScroll: true });
}

/**
 * Closes the mobile miscellaneous sheet and optionally restores focus.
 *
 * @param {{restoreFocus?: boolean}} [options={}] - Close behavior options.
 * @param {boolean} [options.restoreFocus=true] - Whether to focus the opening trigger.
 * @returns {void}
 * @see {@link openMobileMiscSheet}
 */
export function closeMobileMiscSheet({ restoreFocus = true } = {}) {
  const sheet = document.getElementById("mobileMiscSheet");
  const toggle = document.getElementById("mobileMiscToggle");

  if (!sheet || !sheet.classList.contains("is-open")) return;
  sheet.classList.remove("is-open");
  sheet.inert = true;
  sheet.setAttribute("aria-hidden", "true");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("mobile-misc-sheet-open");
  window.setTimeout(() => {
    if (!sheet.classList.contains("is-open")) sheet.hidden = true;
  }, 180);
  if (
    restoreFocus &&
    activeMobileMiscTrigger &&
    document.contains(activeMobileMiscTrigger)
  )
    activeMobileMiscTrigger.focus({ preventScroll: true });
  activeMobileMiscTrigger = null;
}

/**
 * Delays callback execution until calls stop arriving for the specified interval.
 * The returned function also exposes `cancel()` to clear a pending invocation.
 *
 * @param {Function} callback - Function invoked after the delay.
 * @param {number} delay - Delay in milliseconds.
 * @returns {Function & {cancel: Function}} Debounced callback with a cancel method.
 */
export function debounce(callback, delay) {
  let timerId;
  const debounced = function (...args) {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => callback.apply(this, args), delay);
  };
  debounced.cancel = function () {
    window.clearTimeout(timerId);
  };
  return debounced;
}
