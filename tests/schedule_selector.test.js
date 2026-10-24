import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSchedule,
  getActiveSchedule,
  getSchedules,
  initializeScheduleState,
} from "../web/classes/static/js/schedule/schedule-state.js";
import {
  initializeScheduleSelector,
  refreshScheduleSelector,
} from "../web/classes/static/js/schedule/schedule-selector.js";

const click = (element) =>
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

describe("schedule selector", () => {
  const onScheduleChange = vi.fn(() => Promise.resolve());

  beforeAll(() => {
    document.body.innerHTML = `
      <div class="dropdown">
        <button id="scheduleSelectorButton" aria-expanded="false"></button>
        <div id="scheduleSelectorMenu">
          <div id="scheduleSelectorList" class="schedule-selector-list"></div>
          <button data-schedule-action="new">New Schedule</button>
        </div>
      </div>
    `;
    initializeScheduleState();
    initializeScheduleSelector({ onScheduleChange });
  });

  beforeEach(() => {
    localStorage.clear();
    initializeScheduleState();
    refreshScheduleSelector();
    onScheduleChange.mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders the active schedule and all rows in a scrollable list", () => {
    createSchedule("Second");
    createSchedule("Third");
    createSchedule("Fourth");
    refreshScheduleSelector();

    expect(document.querySelectorAll(".schedule-row")).toHaveLength(4);
    expect(document.querySelector(".schedule-row.is-active .schedule-row-name").textContent).toBe(
      "My Schedule",
    );
    expect(document.getElementById("scheduleSelectorList").className).toContain(
      "schedule-selector-list",
    );
  });

  it("creates and activates an empty Untitled Schedule", async () => {
    click(document.querySelector('[data-schedule-action="new"]'));
    await Promise.resolve();

    expect(getActiveSchedule().name).toBe("Untitled Schedule");
    expect(getActiveSchedule().section_refs).toEqual([]);
    expect(onScheduleChange).toHaveBeenCalled();
  });

  it("supports inline rename with Enter and Escape cancellation", () => {
    const edit = document.querySelector('[data-schedule-action="edit"]');
    click(edit);
    const input = document.querySelector(".schedule-row-input");
    input.value = "Renamed";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(getSchedules()[0].name).toBe("Renamed");

    const secondEdit = document.querySelector('[data-schedule-action="edit"]');
    click(secondEdit);
    const secondInput = document.querySelector(".schedule-row-input");
    secondInput.value = "Discarded";
    secondInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(getSchedules()[0].name).toBe("Renamed");
  });

  it("confirms deletion and keeps the final schedule protected", () => {
    const second = createSchedule("Second");
    refreshScheduleSelector();
    const deleteButton = document.querySelector(
      `[data-schedule-action="delete"][data-schedule-id="${second.id}"]`,
    );
    click(deleteButton);
    expect(getSchedules()).toHaveLength(1);
    expect(window.confirm).toHaveBeenCalled();
    expect(document.querySelector('[data-schedule-action="delete"]')).not.toBeNull();
  });
});
