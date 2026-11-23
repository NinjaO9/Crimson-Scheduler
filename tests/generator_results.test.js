import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderCalendarScaffold } from "../web/classes/static/src/schedule/calendar-scaffold.js";
import { initializeScheduleGeneratorController } from "../web/classes/static/src/schedule/generator-results.js";

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
      <button id="addGeneratedScheduleBtn" disabled>Add Schedule</button>
      <span id="mobileCombinationsCount">(0)</span>
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
    renderCalendarScaffold(header, grid, (day, hour) => `generator-cell-${day}-${hour}`, { fitMobileWeek: true });
    expect(header.style.gridTemplateColumns).toContain("minmax(96px, 1fr)");
    expect(document.getElementById("calendarGrid").textContent).toBe("Creator course");
    window.matchMedia = vi.fn(() => ({ matches: true }));
    renderCalendarScaffold(header, grid, (day, hour) => `generator-cell-${day}-${hour}`);
    expect(header.children).toHaveLength(6);
    expect(header.children[1].textContent).toBe("Mon");
    expect(header.style.gridTemplateColumns).toContain("minmax(64px, 1fr)");
    renderCalendarScaffold(header, grid, (day, hour) => `generator-cell-${day}-${hour}`, { fitMobileWeek: true });
    expect(header.style.gridTemplateColumns).toBe("52px repeat(5, minmax(0, 1fr))");
    expect(grid.style.gridTemplateColumns).toBe(header.style.gridTemplateColumns);
    expect(header.children).toHaveLength(6);
    expect(document.getElementById("calendarGrid").textContent).toBe("Creator course");
  });

  it("resets the Generator calendar's horizontal scroll when rendering on mobile", () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    const calendar = document.querySelector(".generator-calendar-wrap");
    calendar.scrollLeft = 90;
    const controller = initializeScheduleGeneratorController();
    expect(calendar.scrollLeft).toBe(0);
    expect(document.getElementById("generatorCalendarHeader").children).toHaveLength(6);
    controller.setResults([{ id: "first", sections: [section("MATH 171", "MWF", "9:00 AM - 9:50 AM")] }]);
    expect(document.querySelectorAll(".generator-result-block")).toHaveLength(3);
    expect(document.querySelector(".generator-result-block").getAttribute("aria-label")).toContain("MATH 171");
    expect(calendar.getAttribute("aria-label")).toContain("possibility 1");
  });

  it("renders supplied candidates, selects a preview, and clears results", () => {
    const onResultSelected = vi.fn();
    const controller = initializeScheduleGeneratorController({ onResultSelected });
    const addButton = document.getElementById("addGeneratedScheduleBtn");
    const grid = document.getElementById("generatorCalendarGrid");
    const calendar = document.querySelector(".generator-calendar-wrap");
    expect(grid.querySelectorAll(".generator-result-block")).toHaveLength(0);
    expect(controller.getActiveResult()).toBeNull();
    expect(addButton.disabled).toBe(true);
    calendar.scrollTop = 348;
    controller.setResults([
      { id: "first", sections: [section("CPT_S 121", "MWF", "9:00 AM - 9:50 AM")] },
      { id: "second", sections: [section("MATH 171", "TR", "10:00 AM - 10:50 AM")] },
      { id: "third", sections: [section("CHEM 105", "MWF", "1:00 PM - 1:50 PM")] },
    ]);
    expect(grid.querySelectorAll(".generator-result-block")).toHaveLength(3);
    expect(controller.getActiveResult().id).toBe("first");
    expect(addButton.disabled).toBe(false);
    expect(calendar.scrollTop).toBe(0);
    expect(document.querySelectorAll(".generator-preview")).toHaveLength(3);
    expect(document.getElementById("mobileCombinationsCount").textContent).toBe("(3)");
    expect(document.querySelector(".generator-preview").getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("generatorResultsEmpty").hidden).toBe(true);
    document.getElementById("generatorPreviewList").scrollLeft = 42;
    document.getElementById("generatorPreviewList").scrollTop = 64;
    calendar.scrollTop = 116;
    document.querySelectorAll(".generator-preview")[1].click();
    expect(onResultSelected).toHaveBeenCalledOnce();
    expect(controller.getActiveResult().id).toBe("second");
    expect(grid.querySelectorAll(".generator-result-block")).toHaveLength(2);
    expect(grid.textContent).toContain("MATH 171");
    expect(document.activeElement).toBe(document.querySelectorAll(".generator-preview")[1]);
    expect(document.querySelectorAll(".generator-preview")[1].getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("generatorPreviewList").scrollLeft).toBe(42);
    expect(document.getElementById("generatorPreviewList").scrollTop).toBe(64);
    expect(calendar.scrollTop).toBe(116);
    expect(controller.selectResult("missing")).toBe(false);
    controller.setResults([]);
    expect(controller.getActiveResult()).toBeNull();
    expect(addButton.disabled).toBe(true);
    expect(grid.querySelectorAll(".generator-result-block")).toHaveLength(0);
    expect(document.querySelectorAll(".generator-preview")).toHaveLength(0);
    expect(document.getElementById("generatorResultsEmpty").hidden).toBe(false);
    expect(document.getElementById("mobileCombinationsCount").textContent).toBe("(0)");
    expect(document.getElementById("calendarGrid").textContent).toBe("Creator course");
  });
});
