import { MOBILE_BREAKPOINT } from "./constants.js";

export function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export function initializeMobileLayout() {
  setMobilePane("search");
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
