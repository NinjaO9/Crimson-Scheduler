import type { CatalogCourse, HydratedSection, SectionReference } from "../types.js";
import { generateSchedules, type ScheduleContender } from "./schedule-generation.js";
import type { GeneratorResultsController, GeneratedSchedule } from "./generator-results.js";

const DEFAULT_EMPTY_MESSAGE = "Generated schedule alternatives will appear here.";

/** 
 * Resolves generated references using the same selected catalog data used by the search.
 */
export function hydrateGeneratedResults(contenders: ScheduleContender[], courses: CatalogCourse[]): GeneratedSchedule[] {
  const sections = new Map<string, HydratedSection>();
  for (const course of courses) {
    for (const section of [...course.lecture_sections, ...course.lab_sections]) {
      sections.set(`${section.term_slug}:${section.section_id}`, {
        ...section,
        schedule_group_id: null,
      });
    }
  }
  return contenders.map((contender, index) => ({
    id: `generated-${index + 1}`,
    sections: contender.sectionrefs.map((reference: SectionReference) => {
      const section = sections.get(`${reference.term_slug}:${reference.section_id}`);
      if (!section) throw new Error(`Generated section ${reference.section_id} is missing from selected courses.`);
      return { ...section, schedule_group_id: reference.schedule_group_id };
    }),
  }));
}

/** 
 * Connects the selection, generation action, and in-memory results view.
 */
export function initializeGeneratorWorkflow(getCourses: () => CatalogCourse[], results: GeneratorResultsController, runGeneration: (courses: CatalogCourse[]) => ScheduleContender[] | Promise<ScheduleContender[]> = generateSchedules): { selectionChanged: () => void } {
  const button = document.querySelector<HTMLButtonElement>("#generateSchedulesBtn");
  const empty = document.getElementById("generatorResultsEmpty");
  let revision = 0;
  let generating = false;

  const syncButton = (): void => {
    if (button) button.disabled = generating || getCourses().length === 0;
  };

  const selectionChanged = (): void => {
    revision += 1;
    results.setResults([]);
    if (empty) empty.textContent = DEFAULT_EMPTY_MESSAGE;
    syncButton();
  };

  button?.addEventListener("click", async () => {
    if (generating || !getCourses().length) return;
    const currentRevision = revision;
    const courses = getCourses();
    generating = true;
    button.textContent = "Generating…";
    syncButton();
    if (empty) empty.textContent = "Generating schedules…";
    try {
      // Let the loading state paint before the synchronous search starts
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const contenders = await runGeneration(courses);
      if (currentRevision !== revision) return;
      const generated = hydrateGeneratedResults(contenders, courses);
      results.setResults(generated);
      if (!generated.length && empty)
        empty.textContent = "No conflict-free schedule exists for the selected courses.";
    }
    catch (error) {
      if (currentRevision === revision) {
        results.setResults([]);
        if (empty) empty.textContent = "Schedule generation failed. Please try again.";
        console.error("Schedule generation failed:", error);
      }
    }
    finally {
      generating = false;
      button.textContent = "Generate Schedules";
      syncButton();
    }
  });
  syncButton();
  return { selectionChanged };
}
