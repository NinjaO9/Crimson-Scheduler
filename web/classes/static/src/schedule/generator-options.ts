import {
  GENERATOR_COUNT_STORAGE_KEY,
  GENERATOR_DEFAULT_SCHEDULES,
  GENERATOR_MAX_SCHEDULES,
  GENERATOR_MIN_SCHEDULES,
} from "./constants.js";
import { normalizeGeneratorCount } from "./schedule-generation.js";
import { isMobileViewport } from "./responsive.js";

/** 
 * Prepares Generator options for both mobile and desktop views. 
 */
export function initializeGeneratorOptions(): { getCount: () => number } {
  const button = document.querySelector<HTMLButtonElement>("#generatorOptionsBtn");
  const sheet = document.querySelector<HTMLElement>("#mobileGeneratorOptionsSheet");
  const panel = sheet?.querySelector<HTMLElement>(".mobile-generator-options-panel");
  const popover = document.querySelector<HTMLElement>("#desktopGeneratorOptionsPopover");
  const mobileHost = document.querySelector<HTMLElement>("#mobileGeneratorOptionsHost");
  const desktopHost = document.querySelector<HTMLElement>("#desktopGeneratorOptionsHost");
  const field = document.querySelector<HTMLElement>(".generator-options-field");
  const output = field?.querySelector<HTMLOutputElement>("#generatorScheduleCount");
  const decrease = field?.querySelector<HTMLButtonElement>('[data-generator-count-step="-1"]');
  const increase = field?.querySelector<HTMLButtonElement>('[data-generator-count-step="1"]');
  let count = GENERATOR_DEFAULT_SCHEDULES;
  let currentMobile: boolean | null = null;

  try {
    const stored = localStorage.getItem(GENERATOR_COUNT_STORAGE_KEY);
    if (stored !== null) count = normalizeGeneratorCount(Number(stored));
  } catch {
    // The current selection still works when storage is unavailable.
  }

  const syncCount = (): void => {
    if (output) output.textContent = String(count);
    if (decrease) decrease.disabled = count <= GENERATOR_MIN_SCHEDULES;
    if (increase) increase.disabled = count >= GENERATOR_MAX_SCHEDULES;
  };
  syncCount();

  const closeMobile = (restoreFocus = true): void => {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove("is-open");
    sheet.inert = true;
    sheet.setAttribute("aria-hidden", "true");
    button?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-generator-options-sheet-open");
    window.setTimeout(() => {
      if (!sheet.classList.contains("is-open")) sheet.hidden = true;
    }, 180);
    if (restoreFocus) button?.focus({ preventScroll: true });
  };

  const closeDesktop = (restoreFocus = true): void => {
    if (!popover || popover.hidden) return;
    const focusWasInside = popover.contains(document.activeElement);
    popover.hidden = true;
    popover.inert = true;
    popover.setAttribute("aria-hidden", "true");
    button?.setAttribute("aria-expanded", "false");
    if (restoreFocus || focusWasInside) button?.focus({ preventScroll: true });
  };

  const openMobile = (): void => {
    if (!button || !sheet || !panel) return;
    sheet.hidden = false;
    sheet.inert = false;
    sheet.setAttribute("aria-hidden", "false");
    button.setAttribute("aria-expanded", "true");
    document.body.classList.add("mobile-generator-options-sheet-open");
    window.requestAnimationFrame(() => {
      if (!sheet.inert) sheet.classList.add("is-open");
    });
    panel.focus({ preventScroll: true });
  };

  const openDesktop = (): void => {
    if (!button || !popover) return;
    popover.hidden = false;
    popover.inert = false;
    popover.setAttribute("aria-hidden", "false");
    button.setAttribute("aria-expanded", "true");
    const trigger = button.getBoundingClientRect();
    const surface = popover.getBoundingClientRect();
    const left = Math.max(16, Math.min(trigger.right - surface.width, window.innerWidth - surface.width - 16));
    const below = trigger.bottom + 8;
    const top = below + surface.height <= window.innerHeight - 16
      ? below
      : Math.max(16, trigger.top - surface.height - 8);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    (decrease?.disabled ? increase : decrease)?.focus({ preventScroll: true });
  };

  const syncViewport = (): void => {
    const mobile = isMobileViewport();
    if (button) button.disabled = !sheet || !popover || !panel || !field || !mobileHost || !desktopHost;
    if (currentMobile !== mobile) {
      const mobileWasOpen = !!sheet && !sheet.hidden;
      closeMobile(false);
      closeDesktop(false);
      if (field) (mobile ? mobileHost : desktopHost)?.appendChild(field);
      button?.setAttribute("aria-controls", mobile ? "mobileGeneratorOptionsSheet" : "desktopGeneratorOptionsPopover");
      currentMobile = mobile;
      if (mobileWasOpen) button?.focus({ preventScroll: true });
    } else if (!mobile) {
      closeDesktop();
    }
  };

  button?.addEventListener("click", () => {
    if (button.disabled) return;
    if (isMobileViewport()) {
      if (sheet?.hidden) openMobile();
      else closeMobile();
    } else if (popover?.hidden) openDesktop();
    else closeDesktop();
  });
  sheet?.querySelectorAll<HTMLElement>("[data-close-generator-options]").forEach((control) => {
    control.addEventListener("click", () => closeMobile());
  });

  const step = (delta: number): void => {
    const next = normalizeGeneratorCount(count + delta);
    if (next === count) return;
    count = next;
    syncCount();
    try {
      localStorage.setItem(GENERATOR_COUNT_STORAGE_KEY, String(count));
    } catch {
      // Keep the in-memory choice for this visit.
    }
  };
  decrease?.addEventListener("click", () => step(-1));
  increase?.addEventListener("click", () => step(1));

  document.addEventListener("click", (event) => {
    if (popover?.hidden || !(event.target instanceof Node)) return;
    if (!popover?.contains(event.target) && !button?.contains(event.target)) closeDesktop(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (sheet && !sheet.hidden) closeMobile();
    else if (popover && !popover.hidden) closeDesktop();
  });
  window.addEventListener("scroll", (event) => {
    if (popover?.hidden || event.target instanceof Node && popover?.contains(event.target)) return;
    closeDesktop();
  }, true);
  window.addEventListener("resize", syncViewport);
  syncViewport();
  return { getCount: () => count };
}
