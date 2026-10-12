/**
 * @fileoverview Exports the rendered schedule as a downloadable image.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { slugifyScheduleName } from "./preferences.js";
import html2canvas from "html2canvas";
import { isGoogleOrChromeMobileApp } from "./responsive.js";

/**
 * Waits for the next paint before capturing layout with html2canvas.
 *
 * @returns {Promise<void>} Promise resolved on the next animation frame.
 */
export function nextAnimationFrame() {
  return new Promise((resolve) =>
    window.requestAnimationFrame(() => resolve()),
  );
}
/**
 * Builds a date-stamped PNG filename for a schedule export.
 *
 * @param {string} name - User-visible schedule name.
 * @returns {string} Safe PNG filename.
 * @see {@link slugifyScheduleName}
 */
export function buildScheduleExportFilename(name) {
  const today = new Date();
  const dateToken = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return `${slugifyScheduleName(name)}-${dateToken}.png`;
}

/**
 * Reads the rendered schedule surface color for use in image export.
 *
 * @param {HTMLElement} schedulePane - Schedule element being captured.
 * @returns {string} Computed CSS background color.
 */
export function getScheduleExportBackgroundColor(schedulePane) {
  return window.getComputedStyle(schedulePane).backgroundColor;
}

/**
 * Converts a canvas to a PNG blob and triggers a browser download.
 *
 * @param {HTMLCanvasElement} canvas - Rendered canvas to export.
 * @param {string} filename - Download filename.
 * @returns {Promise<boolean>} Whether a PNG blob was created and downloaded.
 */
export function downloadCanvasImage(canvas, filename) {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => {
      if (!blob) {
        window.alert("Sorry, the schedule image could not be created.");
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve(true);
    }, "image/png"),
  );
}

/**
 * Creates the image-export handler used by the schedule actions menu.
 *
 * @param {{getScheduleName: function(): string, normalizeScheduleName: function(): void, clearSectionGhosts: function(): void}} dependencies - Schedule UI callbacks.
 * @returns {function(): Promise<void>} Async handler that captures and downloads the schedule.
 * @see {@link downloadCanvasImage}
 */
export function initializeScheduleExport({
  getScheduleName,
  normalizeScheduleName,
  clearSectionGhosts,
}) {
  return async function exportSchedule() {
    if (isGoogleOrChromeMobileApp()) return;
    const schedulePane = document.querySelector(".schedule-pane");
    const exportButton = document.getElementById("exportScheduleBtn");
    if (!schedulePane || !exportButton) return;
    normalizeScheduleName();
    if (
      !window.confirm(
        `Create and download a PNG image of "${getScheduleName()}"?`,
      )
    )
      return;
    const originalButtonText = exportButton.textContent;
    exportButton.disabled = true;
    exportButton.textContent = "Exporting...";
    exportButton.setAttribute("aria-busy", "true");
    clearSectionGhosts();
    document.body.classList.add("schedule-export-active");
    schedulePane.classList.add("is-exporting");
    try {
      // Wait until temporary export classes are painted before html2canvas reads the DOM.
      await nextAnimationFrame();
      const canvas = await html2canvas(schedulePane, {
        backgroundColor: getScheduleExportBackgroundColor(schedulePane),
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        width: schedulePane.scrollWidth,
        height: schedulePane.scrollHeight,
        windowWidth: Math.max(
          document.documentElement.clientWidth,
          schedulePane.scrollWidth,
        ),
        windowHeight: Math.max(
          document.documentElement.clientHeight,
          schedulePane.scrollHeight,
        ),
      });
      await downloadCanvasImage(
        canvas,
        buildScheduleExportFilename(getScheduleName()),
      );
    } catch (error) {
      window.alert("Sorry, the schedule image could not be created.");
    } finally {
      schedulePane.classList.remove("is-exporting");
      document.body.classList.remove("schedule-export-active");
      exportButton.disabled = false;
      exportButton.textContent = originalButtonText;
      exportButton.removeAttribute("aria-busy");
    }
  };
}
