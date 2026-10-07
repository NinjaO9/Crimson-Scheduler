import { beforeEach, describe, expect, it } from "vitest";
import {
  appendScheduleEntries,
  clearSchedule,
  getSchedule,
  initializeScheduleState,
  createWorkspace,
  getLastMigrationReport,
  getScheduleWorkspace,
  loadScheduleWorkspace,
  parseStoredSchedule,
  parseStoredWorkspace,
  removeScheduleEntry,
  replaceSchedule,
  updateScheduleWorkspaceName,
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

  it("creates a versioned workspace containing section references", () => {
    const result = createWorkspace([
      { ...entry("1"), term_slug: "fall-2026", schedule_group_id: "1-2" },
      { ...entry("2"), term_slug: "fall-2026", schedule_group_id: "1-2" },
    ], "Fall Draft");

    expect(result.excludedCount).toBe(0);
    expect(result.workspace).toEqual({
      version: 2,
      active_schedule_id: "default",
      schedules: {
        default: {
          id: "default",
          name: "Fall Draft",
          section_refs: [
            { term_slug: "fall-2026", section_id: "1", schedule_group_id: "1-2" },
            { term_slug: "fall-2026", section_id: "2", schedule_group_id: "1-2" },
          ],
        },
      },
    });
  });

  it("excludes legacy entries that cannot be refreshed", () => {
    const result = createWorkspace([
      { ...entry("1"), term_slug: "fall-2026" },
      entry("2"),
    ]);

    expect(result.excludedCount).toBe(1);
    expect(result.workspace.schedules.default.section_refs).toHaveLength(1);
  });

  it("migrates the legacy schedule into local workspace storage", () => {
    localStorage.removeItem("crimson_scheduler_workspace");
    localStorage.setItem(
      "crimson_scheduler_schedule",
      JSON.stringify([{ ...entry("1"), term_slug: "fall-2026" }]),
    );
    localStorage.setItem("crimson_scheduler_schedule_name", "Fall Draft");

    const workspace = loadScheduleWorkspace();

    expect(workspace.version).toBe(2);
    expect(getScheduleWorkspace()).toEqual(workspace);
    expect(JSON.parse(localStorage.getItem("crimson_scheduler_workspace"))).toEqual(workspace);
    expect(getLastMigrationReport()).toEqual({ migrated: true, excludedCount: 0 });
  });

  it("parses valid workspaces and rejects incompatible ones", () => {
    const valid = createWorkspace([{ ...entry("1"), term_slug: "fall-2026" }]).workspace;

    expect(parseStoredWorkspace(JSON.stringify(valid))).toEqual(valid);
    expect(parseStoredWorkspace(JSON.stringify({ version: 1 }))).toBeNull();
    expect(parseStoredWorkspace("not json")).toBeNull();
  });

  it("persists the workspace whenever the schedule changes", () => {
    appendScheduleEntries([{ ...entry("1"), term_slug: "fall-2026" }]);

    const workspace = JSON.parse(localStorage.getItem("crimson_scheduler_workspace"));
    expect(workspace.schedules.default.section_refs).toEqual([
      { term_slug: "fall-2026", section_id: "1", schedule_group_id: null },
    ]);
  });

  it("keeps the workspace schedule name synchronized", () => {
    appendScheduleEntries([{ ...entry("1"), term_slug: "fall-2026" }]);

    expect(updateScheduleWorkspaceName("Updated Plan")).toBe(true);
    const workspace = JSON.parse(localStorage.getItem("crimson_scheduler_workspace"));
    expect(workspace.schedules.default.name).toBe("Updated Plan");
  });
});
