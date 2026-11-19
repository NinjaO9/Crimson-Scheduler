import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderCalendarScaffold } from "../web/classes/static/src/schedule/calendar-scaffold.js";
import { initializeGeneratorResults } from "../web/classes/static/src/schedule/generator-results.js";

const section = (code, days, time) => ({
  course_code: code,
  meetings: [{ days, time }],
});

describe("generator results", () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = vi.fn(() => ({ matches: false }));
    document.body.innerHTML = `
      <input id="timeFormatToggle" type="checkbox">
      <input id="hideWeekendsToggle" type="checkbox" checked>
      <div id="calendarHeader"></div><div id="calendarGrid">Creator course</div>
      <div class="generator-calendar-wrap" tabindex="-1">
        <div id="generatorCalendarHeader"></div><div id="generatorCalendarGrid"></div>
      </div>
      <p id="generatorResultsEmpty"></p><div id="generatorPreviewList"></div>
    `;
  });

  it("builds calendar cells from preferences without changing Creator", () => {
    const header = document.getElementById("generatorCalendarHeader");
    const grid = document.getElementById("generatorCalendarGrid");
    renderCalendarScaffold(header, grid, (day, hour) => `generator-cell-${day}-${hour}`);
    expect(header.children).toHaveLength(6);
    expect(grid.querySelectorAll(".calendar-time-slot")).toHaveLength(16);
    expect(grid.querySelector(".calendar-time-slot").textContent).toBe("7:00 AM");
    document.getElementById("timeFormatToggle").checked = true;
    document.getElementById("hideWeekendsToggle").checked = false;
    renderCalendarScaffold(header, grid, (day, hour) => `generator-cell-${day}-${hour}`);
    expect(header.children).toHaveLength(8);
    expect(grid.querySelector(".calendar-time-slot").textContent).toBe("07:00");
    expect(document.getElementById("calendarGrid").textContent).toBe("Creator course");
    window.matchMedia = vi.fn(() => ({ matches: true }));
    renderCalendarScaffold(header, grid, (day, hour) => `generator-cell-${day}-${hour}`);
    expect(header.children).toHaveLength(6);
    expect(header.children[1].textContent).toBe("Mon");
  });

  it("renders supplied candidates, selects a preview, and clears results", () => {
    const controller = initializeGeneratorResults();
    const grid = document.getElementById("generatorCalendarGrid");
    expect(grid.querySelectorAll(".generator-result-block")).toHaveLength(0);
    controller.setResults([
      { id: "first", sections: [section("CPT_S 121", "MWF", "9:00 AM - 9:50 AM")] },
      { id: "second", sections: [section("MATH 171", "TR", "10:00 AM - 10:50 AM")] },
    ]);
    expect(grid.querySelectorAll(".generator-result-block")).toHaveLength(3);
    expect(document.querySelectorAll(".generator-preview")).toHaveLength(1);
    expect(document.getElementById("generatorResultsEmpty").hidden).toBe(true);
    document.querySelector(".generator-preview").click();
    expect(grid.querySelectorAll(".generator-result-block")).toHaveLength(2);
    expect(grid.textContent).toContain("MATH 171");
    expect(document.activeElement).toBe(document.querySelector(".generator-calendar-wrap"));
    expect(controller.selectResult("missing")).toBe(false);
    controller.setResults([]);
    expect(grid.querySelectorAll(".generator-result-block")).toHaveLength(0);
    expect(document.querySelectorAll(".generator-preview")).toHaveLength(0);
    expect(document.getElementById("generatorResultsEmpty").hidden).toBe(false);
    expect(document.getElementById("calendarGrid").textContent).toBe("Creator course");
  });
});
