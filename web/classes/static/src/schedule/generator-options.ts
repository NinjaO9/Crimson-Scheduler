import {
  GENERATOR_COUNT_STORAGE_KEY,
  GENERATOR_DEFAULT_SCHEDULES,
  GENERATOR_MAX_SCHEDULES,
  GENERATOR_MIN_SCHEDULES,
} from "./constants.js";
import { normalizeGeneratorCount } from "./schedule-generation.js";
import { isMobileViewport } from "./responsive.js";

/** Connects the mobile generator options sheet and returns its schedule count. */
export function initializeGeneratorOptions(): { getCount: () => number } {
  const button = document.querySelector<HTMLButtonElement>("#generatorOptionsBtn");
  const sheet = document.querySelector<HTMLElement>("#mobileGeneratorOptionsSheet");
  const panel = sheet?.querySelector<HTMLElement>(".mobile-generator-options-panel");
  const output = document.querySelector<HTMLOutputElement>("#generatorScheduleCount");
  const decrease = sheet?.querySelector<HTMLButtonElement>('[data-generator-count-step="-1"]');
  const increase = sheet?.querySelector<HTMLButtonElement>('[data-generator-count-step="1"]');
  let count = GENERATOR_DEFAULT_SCHEDULES;

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

  const close = (restoreFocus = true): void => {
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

  const syncViewport = (): void => {
    const mobile = isMobileViewport();
    if (button) button.disabled = !mobile;
    if (!mobile && sheet && !sheet.hidden) {
      close(false);
      document.getElementById("scheduleGeneratorPanel")?.focus({ preventScroll: true });
    }
  };

  button?.addEventListener("click", () => {
    if (!sheet || !panel || !isMobileViewport()) return;
    sheet.hidden = false;
    sheet.inert = false;
    sheet.setAttribute("aria-hidden", "false");
    button.setAttribute("aria-expanded", "true");
    document.body.classList.add("mobile-generator-options-sheet-open");
    window.requestAnimationFrame(() => {
      if (!sheet.inert) sheet.classList.add("is-open");
    });
    panel.focus({ preventScroll: true });
  });

  sheet?.querySelectorAll<HTMLElement>("[data-close-generator-options]").forEach((control) => {
    control.addEventListener("click", () => close());
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sheet && !sheet.hidden) close();
  });
  window.addEventListener("resize", syncViewport);
  syncViewport();
  return { getCount: () => count };
}
