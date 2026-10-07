import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildShareCode,
  fetchScheduleForTerms,
  parseShareCode,
} from "../web/classes/static/js/schedule/sharing.js";

const section = (sectionId, overrides = {}) => ({
  section_id: sectionId,
  section_key: `fall-2026:${sectionId}`,
  term_slug: "fall-2026",
  course_code: "CPT_S 121",
  course_name: "Program Design",
  section_num: sectionId,
  days: "MWF",
  time: "9:00 AM - 9:50 AM",
  credits: "3",
  meetings: [{ days: "MWF", time: "9:00 AM - 9:50 AM" }],
  ...overrides,
});

describe("schedule sharing", () => {
  beforeEach(() => {
    window.CourseApi = {
      fetchDatasetByKey: vi.fn(),
    };
  });

  it("encodes and parses term and section references", () => {
    const code = buildShareCode([
      section("1001"),
      section("1002", { term_slug: "fall-2026" }),
    ], "Fall Draft");

    expect(parseShareCode(code)).toEqual({
      name: "Fall Draft",
      terms: [{ slug: "fall-2026", slns: ["1001", "1002"] }],
    });
  });

  it("imports complete canonical records and groups sections from one course", async () => {
    const first = section("1001");
    const second = section("1002", { is_lab: true, credits: "0" });
    window.CourseApi.fetchDatasetByKey.mockResolvedValue({
      key: "fall-2026",
      sectionsBySln: new Map([
        ["1001", { course: { id: "course-1" }, section: first }],
        ["1002", { course: { id: "course-1" }, section: second }],
      ]),
    });

    const result = await fetchScheduleForTerms([
      { slug: "fall-2026", slns: ["1001", "1002"] },
    ]);

    expect(result.missing_section_ids).toEqual([]);
    expect(result.schedule).toHaveLength(2);
    expect(result.schedule[0]).toMatchObject({
      section_id: "1001",
      meetings: first.meetings,
      schedule_group_id: "1001-1002",
    });
    expect(result.schedule[1]).toMatchObject({
      section_id: "1002",
      is_lab: true,
      schedule_group_id: "1001-1002",
    });
  });

  it("reports section references missing from the current catalog", async () => {
    window.CourseApi.fetchDatasetByKey.mockResolvedValue({
      key: "fall-2026",
      sectionsBySln: new Map([
        ["1001", { course: { id: "course-1" }, section: section("1001") }],
      ]),
    });

    const result = await fetchScheduleForTerms([
      { slug: "fall-2026", slns: ["1001", "9999"] },
    ]);

    expect(result.schedule.map((item) => item.section_id)).toEqual(["1001"]);
    expect(result.missing_section_ids).toEqual(["9999"]);
  });
});
