/**
 * @fileoverview Handles responsive panes, mobile navigation, and mobile sheets.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { MOBILE_BREAKPOINT } from "./constants.js";

let activeMobileMiscTrigger: HTMLElement | null = null;

/**
 * Checks whether the current viewport is at or below the mobile breakpoint.
 *
 * @returns `true` when the mobile layout should be active.
 */
export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

/**
 * Detects Google Search or Chrome mobile app contexts where image export is unavailable.
 * Requires both a mobile viewport and a supported user-agent signature.
 *
 * @param [userAgent=navigator.userAgent] - User-agent string to inspect.
 * @returns `true` when the page is running in a matching mobile app.
 * @see {@link isMobileViewport}
 */
export function isGoogleOrChromeMobileApp(userAgent: string = navigator.userAgent): boolean {
  if (!isMobileViewport()) return false;
  const ua = String(userAgent || "");
  if (/\bGSA\//i.test(ua)) return true;
  if (!/\b(?:Chrome|CriOS)\//i.test(ua)) return false;
  return !/\b(?:EdgA|EdgiOS|OPR|SamsungBrowser)\//i.test(ua);
}

/**
 * Hides or shows the image-export button based on mobile app support.
 *
 * @see {@link isGoogleOrChromeMobileApp}
 */
export function updateMobileImageExportVisibility(): void {
  const exportButton = document.getElementById("exportScheduleBtn");
  if (!exportButton) return;
  const hidden = isGoogleOrChromeMobileApp();
  exportButton.hidden = hidden;
  exportButton.setAttribute("aria-hidden", String(hidden));
}

/**
 * Initializes the mobile layout, miscellaneous panel placement, and export visibility.
 *
 * @see {@link setMobilePane}
 * @see {@link syncMobileMiscPanel}
 * @see {@link updateMobileImageExportVisibility}
 */
export function initializeMobileLayout(): void {
  setMobilePane("search");
  syncMobileMiscPanel();
  updateMobileImageExportVisibility();
}

/**
 * Activates the pane named by a mobile navigation button.
 *
 * @param button - Navigation button with a `data-mobile-nav` value.
 * @see {@link setMobilePane}
 */
export function handleMobileNavigation(button: HTMLElement): void {
  const targetPane = button.getAttribute("data-mobile-nav");
  if (targetPane) setMobilePane(targetPane);
}

/**
 * Synchronizes active pane classes, button pressed state, and shell metadata.
 *
 * @param targetPane - Pane identifier to activate.
 */
export function setMobilePane(targetPane: string): void {
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
 * @see {@link isMobileViewport}
 */
export function syncMobileMiscPanel(): void {
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
 * @param [trigger] - Element that opened the sheet for focus restoration.
 * @see {@link closeMobileMiscSheet}
 */
export function openMobileMiscSheet(trigger?: HTMLElement): void {
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
  const panel = sheet.querySelector<HTMLElement>(".mobile-misc-panel");
  if (panel) panel.focus({ preventScroll: true });
}

/**
 * Closes the mobile miscellaneous sheet and optionally restores focus.
 *
 * @param [options={}] - Close behavior options.
 * @param [options.restoreFocus=true] - Whether to focus the opening trigger.
 * @see {@link openMobileMiscSheet}
 */
export function closeMobileMiscSheet({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
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
 * @param callback - Function invoked after the delay.
 * @param delay - Delay in milliseconds.
 * @returns Debounced callback with a cancel method.
 */
export function debounce(callback: () => void, delay: number): (() => void) & { cancel: () => void } {
  let timerId: number | undefined;
  const debounced = (() => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(callback, delay);
  }) as (() => void) & { cancel: () => void };
  debounced.cancel = function () {
    window.clearTimeout(timerId);
  };
  return debounced;
}
