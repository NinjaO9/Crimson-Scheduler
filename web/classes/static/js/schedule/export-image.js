import { slugifyScheduleName } from "./preferences.js";
import html2canvas from "html2canvas";

export function nextAnimationFrame() {
  return new Promise((resolve) =>
    window.requestAnimationFrame(() => resolve()),
  );
}
export function buildScheduleExportFilename(name) {
  const today = new Date();
  const dateToken = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return `${slugifyScheduleName(name)}-${dateToken}.png`;
}
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
export function initializeScheduleExport({
  getScheduleName,
  normalizeScheduleName,
  clearSectionGhosts,
}) {
  return async function exportSchedule() {
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
      await nextAnimationFrame();
      const canvas = await html2canvas(schedulePane, {
        backgroundColor: "#ffffff",
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
