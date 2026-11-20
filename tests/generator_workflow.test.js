import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSchedules } from "../web/classes/static/src/schedule/schedule-generation.js";
import {
  hydrateGeneratedResults,
  initializeGeneratorWorkflow,
} from "../web/classes/static/src/schedule/generator-workflow.js";

const section = (id, time, days = "M") => ({
  section_id: id,
  section_key: `spring-2027:${id}`,
  term_slug: "spring-2027",
  course_code: id,
  meetings: [{ days, time }],
});
const course = (id, sections, labs = []) => ({
  id,
  course_code: id,
  term_slug: "spring-2027",
  lecture_sections: sections,
  lab_sections: labs,
});

describe("schedule generation integration", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="generateSchedulesBtn" disabled>Generate Schedules</button>
      <p id="generatorResultsEmpty"></p>
    `;
  });

  it("ranks the lowest downtime first and clears the heap between runs", () => {
    const fixed = course("fixed", [section("fixed", "9:00 AM - 10:00 AM")]);
    const flexible = course("flex", [
      section("near", "10:00 AM - 11:00 AM"),
      section("middle", "12:00 PM - 1:00 PM"),
      section("far", "2:00 PM - 3:00 PM"),
    ]);
    const first = generateSchedules([fixed, flexible]);
    expect(first).toHaveLength(3);
    expect(first.map((candidate) => candidate.score)).toEqual(
      [...first.map((candidate) => candidate.score)].sort((a, b) => a - b),
    );
    expect(first[0].sectionrefs.map((ref) => ref.section_id)).toContain("near");
    const second = generateSchedules([fixed]);
    expect(second).toHaveLength(1);
    expect(second[0].sectionrefs).toHaveLength(1);
    expect(generateSchedules([])).toEqual([]);
    expect(generateSchedules([
      fixed,
      course("conflict", [section("conflict", "9:30 AM - 10:30 AM")]),
    ])).toEqual([]);
  });

  it("hydrates paired lecture and lab references without touching Creator data", () => {
    const lecture = section("lecture", "9:00 AM - 10:00 AM");
    const lab = section("lab", "10:00 AM - 11:00 AM");
    const selected = course("combined", [lecture], [lab]);
    const refs = generateSchedules([selected]);
    const creatorRefs = [{ section_id: "creator-only" }];
    const hydrated = hydrateGeneratedResults(refs, [selected]);
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0].sections.map((item) => item.section_id)).toEqual(["lecture", "lab"]);
    expect(hydrated[0].sections[0].schedule_group_id).toBe(
      hydrated[0].sections[1].schedule_group_id,
    );
    expect(creatorRefs).toEqual([{ section_id: "creator-only" }]);
  });

  it("handles loading, no results, failures, and selection changes during a run", async () => {
    let selected = [course("one", [section("one", "9:00 AM - 10:00 AM")])];
    const results = { setResults: vi.fn(), selectResult: vi.fn(), refresh: vi.fn() };
    let finish;
    const run = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const workflow = initializeGeneratorWorkflow(() => selected, results, run);
    const button = document.getElementById("generateSchedulesBtn");
    expect(button.disabled).toBe(false);
    button.click();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Generating");
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    selected = [];
    workflow.selectionChanged();
    finish([{ score: 0, sectionrefs: [] }]);
    await vi.waitFor(() => expect(button.textContent).toBe("Generate Schedules"));
    expect(button.disabled).toBe(true);
    expect(results.setResults).toHaveBeenLastCalledWith([]);

    selected = [course("one", [section("one", "9:00 AM - 10:00 AM")])];
    workflow.selectionChanged();
    run.mockImplementation(() => []);
    button.click();
    await vi.waitFor(() => expect(document.getElementById("generatorResultsEmpty").textContent).toContain("No conflict-free"));
    workflow.selectionChanged();
    run.mockImplementation(() => { throw new Error("search failed"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    button.click();
    await vi.waitFor(() => expect(document.getElementById("generatorResultsEmpty").textContent).toContain("failed"));
    expect(button.disabled).toBe(false);
    log.mockRestore();
  });
});
