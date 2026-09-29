import { MOBILE_BREAKPOINT } from "./constants.js";

let activeMobileMiscTrigger = null;

export function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export function initializeMobileLayout() {
  setMobilePane("search");
  syncMobileMiscPanel();
}

export function handleMobileNavigation(button) {
  setMobilePane(button.getAttribute("data-mobile-nav"));
}

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

export function openMobileMiscSheet(trigger) {
  if (!isMobileViewport()) return;

  const sheet = document.getElementById("mobileMiscSheet");
  const toggle = document.getElementById("mobileMiscToggle");

  if (!sheet || !toggle) return;
  activeMobileMiscTrigger = trigger || toggle;
  sheet.hidden = false;
  sheet.setAttribute("aria-hidden", "false");
  toggle.setAttribute("aria-expanded", "true");
  document.body.classList.add("mobile-misc-sheet-open");
  window.requestAnimationFrame(() => sheet.classList.add("is-open"));
  const panel = sheet.querySelector(".mobile-misc-panel");
  if (panel) panel.focus({ preventScroll: true });
}

export function closeMobileMiscSheet({ restoreFocus = true } = {}) {
  const sheet = document.getElementById("mobileMiscSheet");
  const toggle = document.getElementById("mobileMiscToggle");

  if (!sheet || !sheet.classList.contains("is-open")) return;
  sheet.classList.remove("is-open");
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
