import { END_HOUR, START_HOUR } from "./constants.js";
import { renderCalendarScaffold } from "./calendar-scaffold.js";
import { createElementWithText } from "./dom.js";
import { formatTimeRangeForDisplay, resolveScheduleGroups } from "./time-and-meetings.js";
import type { HydratedSection } from "../types.js";

export type GeneratedSchedule = { id: string; sections: HydratedSection[] };
export type GeneratorResultsController = {
  setResults: (results: GeneratedSchedule[]) => void;
  selectResult: (id: string) => boolean;
  refresh: () => void;
};

/** Prepares the Generator schedule results and returns their update and selection API. */
export function initializeScheduleGeneratorController(): GeneratorResultsController {
  const header = document.getElementById("generatorCalendarHeader");
  const grid = document.getElementById("generatorCalendarGrid");
  const previews = document.getElementById("generatorPreviewList");
  const empty = document.getElementById("generatorResultsEmpty");
  const calendar = document.querySelector<HTMLElement>(".generator-calendar-wrap");
  let results: GeneratedSchedule[] = [];
  let activeId: string | null = null;

  /** Renders the active candidate into the Generator's main calendar grid. */
  const renderFocusedSchedule = (): void => {
    if (!header || !grid) return;
    renderCalendarScaffold(header, grid, (day, hour) => `generator-cell-${day}-${hour}`);
    const active = results.find((result) => result.id === activeId);
    calendar?.setAttribute("aria-label", active
      ? `Generated schedule possibility ${results.indexOf(active) + 1}`
      : "Empty generated schedule");
    for (const section of active?.sections || []) {
      for (const { dayIndexes, timeRange, meeting } of resolveScheduleGroups(section.meetings)) {
        const hour = Math.floor(timeRange.start / 60);
        if (hour < START_HOUR || hour >= END_HOUR) continue;
        for (const day of dayIndexes) {
          const cell = grid.querySelector<HTMLElement>(`#generator-cell-${day}-${hour}`);
          if (!cell) continue;
          const block = createElementWithText("div", "course-block generator-result-block", section.course_code);
          block.appendChild(createElementWithText("span", "generator-result-time", formatTimeRangeForDisplay(meeting.time)));
          block.style.top = `${((timeRange.start % 60) / 60) * 100}%`;
          block.style.height = `${((timeRange.end - timeRange.start) / 60) * 100}%`;
          block.setAttribute("aria-label", `${section.course_code}, ${meeting.days}, ${formatTimeRangeForDisplay(meeting.time)}`);
          cell.appendChild(block);
        }
      }
    }
  };

  /** Renders the non-active candidates as selectable compact schedule previews. */
  const renderSchedulePreviews = (): void => {
    if (!previews || !empty) return;
    previews.replaceChildren();
    const alternatives = results.filter((result) => result.id !== activeId);
    empty.hidden = alternatives.length > 0;
    for (const result of alternatives) {
      const number = results.indexOf(result) + 1;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "generator-preview";
      button.setAttribute("aria-label", `Show schedule possibility ${number}`);
      button.setAttribute("aria-pressed", "false");
      button.appendChild(createElementWithText("span", "generator-preview-number", String(number)));
      const days = document.createElement("span");
      days.className = "generator-preview-days";
      for (let day = 0; day < 5; day++) {
        const column = document.createElement("span");
        column.className = "generator-preview-day";
        column.setAttribute("aria-hidden", "true");
        for (const section of result.sections) {
          for (const group of resolveScheduleGroups(section.meetings)) {
            if (!group.dayIndexes.includes(day)) continue;
            const start = Math.max(group.timeRange.start, START_HOUR * 60);
            const end = Math.min(group.timeRange.end, END_HOUR * 60);
            if (end <= start) continue;
            const bar = document.createElement("span");
            bar.className = "generator-preview-block";
            bar.style.top = `${((start - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60)) * 100}%`;
            bar.style.height = `${Math.max(((end - start) / ((END_HOUR - START_HOUR) * 60)) * 100, 3)}%`;
            column.appendChild(bar);
          }
        }
        days.appendChild(column);
      }
      button.appendChild(days);
      button.addEventListener("click", () => {
        if (selectResult(result.id)) calendar?.focus({ preventScroll: true });
      });
      previews.appendChild(button);
    }
  };

  const render = (): void => {
    renderFocusedSchedule();
    renderSchedulePreviews();
  };

  const selectResult = (id: string): boolean => {
    if (!results.some((result) => result.id === id)) return false;
    activeId = id;
    render();
    return true;
  };
  const setResults = (next: GeneratedSchedule[]): void => {
    results = next.slice();
    activeId = results.some((result) => result.id === activeId) ? activeId : results[0]?.id || null;
    render();
  };
  render();
  
  return { setResults, selectResult, refresh: render };
}
