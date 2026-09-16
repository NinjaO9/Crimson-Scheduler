import { beforeEach, describe, expect, it } from "vitest";
import {
  appendScheduleEntries,
  clearSchedule,
  getSchedule,
  initializeScheduleState,
  parseStoredSchedule,
  removeScheduleEntry,
  replaceSchedule,
} from "../web/classes/static/js/schedule/schedule-state.js";

const entry = (sectionId, groupId = null) => ({
  section_id: sectionId,
  schedule_group_id: groupId,
  course_code: "CPT_S 121",
  days: "MWF",
  time: "9:00 AM - 9:50 AM",
});

describe("schedule state", () => {
  beforeEach(() => {
    localStorage.clear();
    initializeScheduleState();
  });

  it("filters malformed persisted entries", () => {
    expect(
      parseStoredSchedule(JSON.stringify([entry("1"), { section_id: "2" }])),
    ).toEqual([entry("1")]);
  });

  it("does not append duplicate sections", () => {
    appendScheduleEntries([entry("1")]);
    expect(appendScheduleEntries([entry("1")])).toEqual([]);
    expect(getSchedule()).toHaveLength(1);
  });

  it("removes every entry in a lecture/lab group", () => {
    replaceSchedule([entry("1", "1-2"), entry("2", "1-2"), entry("3")]);
    expect(removeScheduleEntry("1")).toBe(true);
    expect(getSchedule().map((item) => item.section_id)).toEqual(["3"]);
  });

  it("clears the stored in-memory schedule", () => {
    appendScheduleEntries([entry("1")]);
    clearSchedule();
    expect(getSchedule()).toEqual([]);
  });
});
