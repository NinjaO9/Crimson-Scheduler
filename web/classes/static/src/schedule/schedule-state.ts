/**
 * @fileoverview Manages the active schedule workspace and local persistence.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import {
  DEFAULT_SCHEDULE_NAME,
  REQUIRED_COURSE_FIELDS,
  SCHEDULE_WORKSPACE_STORAGE_KEY,
  SCHEDULE_WORKSPACE_VERSION,
} from "./constants.js";
import type { CourseDataset, HydratedSection, HydrationResult, ScheduleRecord, ScheduleWorkspace, SectionReference } from "../types.js";

let currentWorkspace: ScheduleWorkspace | null = null;
const sectionRecordsByKey = new Map<string, HydratedSection>();
let scheduleSectionOrder: string[] = [];
const failedTermKeys = new Set<string>();

/**
 * Returns the stable term/section key used by the runtime indexes.
 *
 * @param section - Section record containing `term_slug` and `section_id`.
 * @returns Existing section key, derived key, or `null` for invalid data.
 */
function getSectionRecordKey(section: Partial<HydratedSection> | null | undefined): string | null {
  if (!section || !section.section_id || !section.term_slug) return null;
  if (section.section_key) return String(section.section_key);
  return `${String(section.term_slug)}:${String(section.section_id)}`;
}

/**
 * Returns the persisted active schedule from the current workspace.
 *
 * @returns Active schedule metadata, or `null` before initialization.
 */
function getActiveScheduleRecord(): ScheduleRecord | null {
  if (!currentWorkspace || !currentWorkspace.schedules) return null;
  return currentWorkspace.schedules[currentWorkspace.active_schedule_id] || null;
}

/**
 * Returns runtime section records in their insertion order.
 *
 * @returns Hydrated schedule sections currently in memory.
 */
function getRuntimeSchedule(): HydratedSection[] {
  return scheduleSectionOrder
    .map((key) => sectionRecordsByKey.get(key))
    .filter((section): section is HydratedSection => Boolean(section));
}

/**
 * Replaces the runtime index with valid, unique section records.
 *
 * @param scheduleData - Section records to install.
 * @see {@link isValidCourseEntry}
 */
function replaceRuntimeSchedule(scheduleData: HydratedSection[]): void {
  sectionRecordsByKey.clear();
  scheduleSectionOrder = [];
  addRuntimeSections(scheduleData);
}

/**
 * Adds valid section records that are not already present in the runtime index.
 *
 * @param sectionData - Section records to append.
 * @returns Records actually added.
 * @see {@link isValidCourseEntry}
 */
function addRuntimeSections(sectionData: HydratedSection[]): HydratedSection[] {
  const additions: HydratedSection[] = [];
  (Array.isArray(sectionData) ? sectionData : []).forEach((entry) => {
    if (!isValidCourseEntry(entry)) return;
    const key = getSectionRecordKey(entry);
    if (!key || sectionRecordsByKey.has(key)) return;
    sectionRecordsByKey.set(key, entry);
    scheduleSectionOrder.push(key);
    additions.push(entry);
  });
  return additions;
}

/**
 * Builds the stable key for a persisted section reference.
 *
 * @param reference - Reference containing term and section IDs.
 * @returns Composite reference key.
 */
function sectionReferenceKey(reference: SectionReference): string {
  return `${String(reference.term_slug)}:${String(reference.section_id)}`;
}

/**
 * Reduces a hydrated section entry to its persistable reference shape.
 *
 * @param entry - Section entry to reduce.
 * @returns Persistable reference, or `null` for invalid input.
 */
function toSectionReference(entry: Partial<HydratedSection> | null | undefined): SectionReference | null {
  if (!entry || !entry.section_id || !entry.term_slug) return null;
  return {
    term_slug: String(entry.term_slug),
    section_id: String(entry.section_id),
    schedule_group_id: entry.schedule_group_id || null,
  };
}

/**
 * Converts section records into deduplicated persisted references.
 *
 * @param scheduleData - Section entries to convert.
 * @returns References and invalid-entry count.
 */
function createSectionReferences(scheduleData: Array<Partial<HydratedSection> & Partial<SectionReference>>): { sectionRefs: SectionReference[]; excludedCount: number } {
  const seen = new Set<string>();
  const sectionRefs: SectionReference[] = [];
  let excludedCount = 0;

  (Array.isArray(scheduleData) ? scheduleData : []).forEach((entry) => {
    const reference = toSectionReference(entry);
    if (!reference) {
      excludedCount += 1;
      return;
    }
    const key = sectionReferenceKey(reference);
    if (seen.has(key)) return;
    seen.add(key);
    sectionRefs.push(reference);
  });

  return { sectionRefs, excludedCount };
}

/**
 * Creates a Schedule object
 *
 * @param id - Unique identifier for this schedule.
 * @param name - name of the schedule to create.
 * @param sectionRefs - list of sections that are contained within this schedule.
 */
function createScheduleRecord(id: string = "default", name: string = DEFAULT_SCHEDULE_NAME, sectionRefs: SectionReference[] = []): ScheduleRecord {
  return {
    id: String(id),
    name: String(name || DEFAULT_SCHEDULE_NAME),
    section_refs: Array.isArray(sectionRefs) ? sectionRefs : [],
  };
}

/**
 * Creates a unique ID for a newly created schedule.
 *
 * @returns Unique schedule ID.
 */
function createScheduleId(): string {
  const schedules = currentWorkspace?.schedules || {};
  let index = 1;
  while (schedules[`schedule-${index}`]) index += 1;
  return `schedule-${index}`;
}

/**
 * Creates a versioned workspace containing a deduplicated default schedule.
 *
 * @param scheduleData - Section entries to convert into references.
 * @param [name=DEFAULT_SCHEDULE_NAME] - Schedule display name.
 * @returns Workspace and invalid-entry count.
 * @see {@link toSectionReference}
 */
export function createWorkspace(scheduleData: HydratedSection[], name: string = DEFAULT_SCHEDULE_NAME): { workspace: ScheduleWorkspace; excludedCount: number } {
  const { sectionRefs, excludedCount } = createSectionReferences(scheduleData);

  return {
    workspace: {
      version: SCHEDULE_WORKSPACE_VERSION,
      active_schedule_id: "default",
      schedules: {
        default: createScheduleRecord("default", name, sectionRefs),
      },
    },
    excludedCount,
  };
}

/**
 * Parses and validates serialized workspace data against the current version.
 *
 * @param serialized - JSON workspace text from storage.
 * @returns Normalized workspace, or `null` when invalid.
 * @see {@link createWorkspace}
 */
export function parseStoredWorkspace(serialized: string): ScheduleWorkspace | null {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return null;
    const stored = parsed as Partial<ScheduleWorkspace> & { version?: number };

    // Because adding multiple schedules is a change in how we parse a stored workspace,
    // I want to make sure that people who already used the site don't lose anything.
    // So... We are gonna have this little bit of code here to make sure V2 workspaces are handled fine.
    // In the future, I will maybe retire this code (if I remember)
    // But once the user visits the site and edits their schedule, then they should be converted to the new format.
    const schedules: Record<string, unknown> | null | undefined =
    stored.version === 2
        ? { default: stored.schedules && stored.schedules.default }
        : stored.schedules;

    const activeScheduleId =
      stored.version === 2
        ? "default"
        : stored.active_schedule_id;
    if (
      ![SCHEDULE_WORKSPACE_VERSION -1, SCHEDULE_WORKSPACE_VERSION].includes(stored.version ?? -1) || // Version is not supported
      !schedules || // No available schedules
      typeof schedules !== "object" || // Schedules is not an object
      !activeScheduleId || // No active schedule
      !schedules[activeScheduleId] // The id is invalid
    )
      return null;

    // Constructing the schedules from the saved storage.
    const normalizedSchedules: Record<string, ScheduleRecord> = {};
    for (const [scheduleId, schedule] of Object.entries(schedules)) {
      if (!schedule || typeof schedule !== "object" || !("section_refs" in schedule) || !Array.isArray(schedule.section_refs)) return null;
      const savedSchedule = schedule as { name?: string; section_refs: Array<Partial<SectionReference>> };
      const refs = savedSchedule.section_refs.map((reference) => ({
        section_id: reference?.section_id,
        term_slug: reference?.term_slug,
        schedule_group_id: reference?.schedule_group_id,
      }));
      const sectionRefs = refs.map((reference) => toSectionReference(reference)).filter(
        (reference): reference is SectionReference => reference !== null,
      );
      normalizedSchedules[String(scheduleId)] = createScheduleRecord(scheduleId, savedSchedule.name, sectionRefs);
    }

    return {
      version: SCHEDULE_WORKSPACE_VERSION,
      active_schedule_id: String(activeScheduleId),
      schedules: normalizedSchedules,
    };
  } catch {
    return null;
  }
}

/**
 * Loads the persisted workspace or creates and persists an empty one.
 *
 * @returns Current workspace.
 * @see {@link parseStoredWorkspace}
 * @see {@link persistWorkspace}
 */
export function loadScheduleWorkspace(): ScheduleWorkspace {
  try {
    const storedWorkspace = localStorage.getItem(
      SCHEDULE_WORKSPACE_STORAGE_KEY,
    );
    if (storedWorkspace !== null) {
      const parsedWorkspace = parseStoredWorkspace(storedWorkspace);
      if (parsedWorkspace) {
        currentWorkspace = parsedWorkspace;
        return currentWorkspace;
      }
    }
  } catch (error) {
    console.warn("Unable to read schedule workspace from local storage:", error);
  }

  currentWorkspace = createWorkspace([]).workspace;
  persistWorkspace(currentWorkspace);
  return currentWorkspace;
}

/**
 * Returns the in-memory workspace object.
 *
 * @returns Current workspace, or `null` before loading.
 */
export function getScheduleWorkspace(): ScheduleWorkspace | null {
  return currentWorkspace;
}

/**
 * Updates and persists the default schedule's display name.
 *
 * @param name - New schedule name.
 * @returns Whether persistence succeeded; `false` if no schedule exists.
 * @see {@link persistWorkspace}
 */
export function updateScheduleWorkspaceName(name: string): boolean {
  const workspace = currentWorkspace || loadScheduleWorkspace();
  const schedule = getActiveScheduleRecord();
  if (!schedule) return false;
  schedule.name = String(name || DEFAULT_SCHEDULE_NAME);
  return persistWorkspace(workspace);
}

/**
 * Serializes a workspace into local storage.
 *
 * @param workspace - Workspace to persist.
 * @returns Whether local-storage persistence succeeded.
 */
function persistWorkspace(workspace: ScheduleWorkspace | null): boolean {
  try {
    localStorage.setItem(
      SCHEDULE_WORKSPACE_STORAGE_KEY,
      JSON.stringify(workspace),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Replaces persisted references after hydration and saves the workspace.
 *
 * @param sectionRefs - References retained after dataset resolution.
 * @returns Whether persistence succeeded.
 * @see {@link persistWorkspace}
 */
function updateActiveScheduleReferences(sectionRefs: SectionReference[]): boolean {
  const schedule = getActiveScheduleRecord();
  if (!schedule) return false;
  schedule.section_refs = sectionRefs;
  return persistWorkspace(currentWorkspace);
}

/**
 * Checks whether a section has the required fields for runtime storage.
 *
 * @param item - Candidate section entry.
 * @returns `true` when required course fields and term are present.
 */
export function isValidCourseEntry(item: unknown): item is HydratedSection {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<HydratedSection>;
  return (
    !!candidate.term_slug &&
    REQUIRED_COURSE_FIELDS.every((field) => candidate[field as keyof HydratedSection])
  );
}
/**
 * Loads workspace state and resets the transient runtime schedule.
 *
 * @returns Empty initialized runtime schedule.
 * @see {@link loadScheduleWorkspace}
 * @see {@link replaceRuntimeSchedule}
 */
export function initializeScheduleState(): HydratedSection[] {
  currentWorkspace = loadScheduleWorkspace();
  replaceRuntimeSchedule([]);
  return getRuntimeSchedule();
}

/**
 * Returns the current hydrated runtime schedule.
 *
 * @returns Runtime section records.
 * @see {@link getRuntimeSchedule}
 */
export function getSchedule(): HydratedSection[] {
  return getRuntimeSchedule();
}

/**
 * Looks up one runtime section by its stable key.
 *
 * @param sectionKey - Term/section key to find.
 * @returns Matching section or `null`.
 */
export function getSectionRecord(sectionKey: string): HydratedSection | null {
  return sectionRecordsByKey.get(String(sectionKey)) || null;
}

/**
 * Returns the persisted default schedule metadata and references.
 *
 * @returns Active schedule, or `null` before workspace loading.
 * @see {@link getActiveScheduleRecord}
 */
export function getActiveSchedule(): ScheduleRecord | null {
  return getActiveScheduleRecord();
}

/**
 * Returns all stored schedules.
 *
 * @returns Schedule metadata records.
 */
export function getSchedules(): ScheduleRecord[] {
  return currentWorkspace && currentWorkspace.schedules
    ? Object.values(currentWorkspace.schedules)
    : [];
}

/**
 * Returns a stored schedule by ID.
 *
 * @param scheduleId - Schedule identifier.
 * @returns Matching schedule, or `null` when not found.
 */
export function getScheduleById(scheduleId: string): ScheduleRecord | null {
  if (!currentWorkspace || !scheduleId) return null;
  return currentWorkspace.schedules?.[String(scheduleId)] || null;
}

/**
 * Creates and persists a new empty schedule.
 *
 * @param [name=DEFAULT_SCHEDULE_NAME] - Schedule display name.
 * @returns New schedule, or `null` if persistence fails.
 */
export function createSchedule(name: string = DEFAULT_SCHEDULE_NAME): ScheduleRecord | null {
  const workspace = currentWorkspace || loadScheduleWorkspace();
  const id = createScheduleId();
  const schedule = createScheduleRecord(id, name, []);
  workspace.schedules[id] = schedule;
  return persistWorkspace(workspace) ? schedule : null;
}

export function addSchedule(sections : SectionReference[], name: string = DEFAULT_SCHEDULE_NAME) : void
{
  const workspace = currentWorkspace || loadScheduleWorkspace();
  const id = createScheduleId();
  const schedule = createScheduleRecord(id, name, sections);
  workspace.schedules[id] = schedule;
  persistWorkspace(workspace);
}

/**
 * Renames a stored schedule.
 *
 * @param scheduleId - Schedule identifier.
 * @param name - New schedule display name.
 * @returns Whether the schedule was found and persisted.
 */
export function renameSchedule(scheduleId: string, name: string): boolean {
  const schedule = getScheduleById(scheduleId);
  if (!schedule) return false;
  schedule.name = String(name || DEFAULT_SCHEDULE_NAME);
  return persistWorkspace(currentWorkspace);
}

/**
 * Switches the active schedule and clears the transient runtime records.
 * Callers should invoke hydrateSchedule afterwards to load catalog records.
 *
 * @param scheduleId - Schedule identifier to activate.
 * @returns Newly active schedule, or `null` when not found.
 */
export function switchSchedule(scheduleId: string): ScheduleRecord | null {
  if (!currentWorkspace) return null;
  const nextSchedule = getScheduleById(scheduleId);
  if (!nextSchedule) return null;
  if (currentWorkspace.active_schedule_id === nextSchedule.id)
    return nextSchedule;

  persistRuntimeSchedule();
  currentWorkspace.active_schedule_id = nextSchedule.id;
  replaceRuntimeSchedule([]);
  persistWorkspace(currentWorkspace);
  return nextSchedule;
}

/**
 * Deletes a schedule. Not gonna let the user delete the only schedule, though....
 *
 * @param scheduleId - Schedule identifier.
 * @returns Whether the schedule was deleted and persisted.
 */
export function deleteSchedule(scheduleId: string): boolean {
  if (!currentWorkspace) return false;
  const schedule = getScheduleById(scheduleId);
  if (!schedule || getSchedules().length <= 1) return false;

  const wasActive = currentWorkspace.active_schedule_id === schedule.id;
  delete currentWorkspace.schedules[schedule.id];
  if (wasActive) {
    currentWorkspace.active_schedule_id = Object.keys(currentWorkspace.schedules)[0] ?? currentWorkspace.active_schedule_id;
    replaceRuntimeSchedule([]);
  }
  return persistWorkspace(currentWorkspace);
}

/**
 * Resolves persisted references against term datasets and rebuilds runtime records.
 * Failed terms remain retained for retry; missing sections are omitted and counted.
 *
 * @param fetchDatasetByKey - Async loader returning a dataset with `sectionsBySln`.
 *   Hydrated schedule and resolution diagnostics.
 * @see {@link markTermLoadFailed}
 * @see {@link clearTermLoadFailure}
 */
export async function hydrateSchedule(fetchDatasetByKey: (key: string) => Promise<CourseDataset>): Promise<HydrationResult> {
  const schedule = getActiveScheduleRecord();
  const references = schedule && Array.isArray(schedule.section_refs)
    ? schedule.section_refs
    : [];
  if (!references.length) {
    replaceRuntimeSchedule([]);
    return {
      schedule: [],
      missingCount: 0,
      failedCount: 0,
      failedTerms: [],
    };
  }
  if (typeof fetchDatasetByKey !== "function") {
    replaceRuntimeSchedule([]);
    return {
      schedule: [],
      missingCount: 0,
      failedCount: references.length,
      failedTerms: Array.from(new Set(references.map((reference) => reference.term_slug))),
    };
  }

  const referencesByTerm = new Map<string, SectionReference[]>();
  references.forEach((reference) => {
    const termReferences = referencesByTerm.get(reference.term_slug) ?? [];
    termReferences.push(reference);
    referencesByTerm.set(reference.term_slug, termReferences);
  });

  const resolvedRecords: HydratedSection[] = [];
  const retainedReferences: SectionReference[] = [];
  let missingCount = 0;
  let failedCount = 0;
  const failedTerms: string[] = [];

  await Promise.all(
    Array.from(referencesByTerm, async ([termSlug, termReferences]) => {
      let dataset;
      try {
        dataset = await fetchDatasetByKey(termSlug);
        clearTermLoadFailure(termSlug);
      } catch {
        markTermLoadFailed(termSlug);
        failedTerms.push(termSlug);
        failedCount += termReferences.length;
        retainedReferences.push(...termReferences);
        return;
      }

      termReferences.forEach((reference) => {
        const match = dataset && dataset.sectionsBySln
          ? dataset.sectionsBySln.get(String(reference.section_id))
          : null;
        if (!match || !match.section) {
          missingCount += 1;
          return;
        }
        resolvedRecords.push({
          ...match.section,
          term_slug: termSlug,
          section_key:
            match.section.section_key || `${termSlug}:${reference.section_id}`,
          schedule_group_id: reference.schedule_group_id || null,
        });
        retainedReferences.push(reference);
      });
    }),
  );

  const order = new Map(
    references.map((reference, index) => [
      sectionReferenceKey(reference),
      index,
    ]),
  );
  resolvedRecords.sort(
    (left, right) =>
      (order.get(getSectionRecordKey(left) ?? "") ?? Number.MAX_SAFE_INTEGER) -
      (order.get(getSectionRecordKey(right) ?? "") ?? Number.MAX_SAFE_INTEGER),
  );
  retainedReferences.sort(
    (left, right) =>
      (order.get(sectionReferenceKey(left)) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(sectionReferenceKey(right)) ?? Number.MAX_SAFE_INTEGER),
  );
  failedTerms.sort();
  replaceRuntimeSchedule(resolvedRecords);
  updateActiveScheduleReferences(retainedReferences);

  return {
    schedule: getRuntimeSchedule(),
    missingCount,
    failedCount,
    failedTerms,
  };
}

/**
 * Records a term whose dataset failed to load.
 *
 * @param termSlug - Term key to mark as failed.
 * @see {@link getFailedTermKeys}
 */
export function markTermLoadFailed(termSlug: string): void {
  if (termSlug) failedTermKeys.add(String(termSlug));
}

/**
 * Removes a term from the failed-load set after a successful retry.
 *
 * @param termSlug - Term key to clear.
 * @see {@link markTermLoadFailed}
 */
export function clearTermLoadFailure(termSlug: string): void {
  failedTermKeys.delete(String(termSlug));
}

/**
 * Returns a snapshot of terms whose datasets failed to load.
 *
 * @returns Failed term keys.
 */
export function getFailedTermKeys(): string[] {
  return Array.from(failedTermKeys);
}

/**
 * Returns failed term keys for the caller's retry workflow.
 *
 * @returns Terms eligible for retry.
 * @see {@link getFailedTermKeys}
 */
export function retryFailedTerms(): string[] {
  return getFailedTermKeys();
}

/**
 * Replaces the runtime schedule, persists it, and returns the resulting records.
 *
 * @param scheduleData - Section records for the replacement schedule.
 * @returns Persisted runtime schedule.
 * @see {@link replaceRuntimeSchedule}
 * @see {@link persistRuntimeSchedule}
 */
export function replaceSchedule(scheduleData: HydratedSection[]): HydratedSection[] {
  replaceRuntimeSchedule(scheduleData);
  persistRuntimeSchedule();
  return getRuntimeSchedule();
}
/**
 * Adds new runtime entries and persists only when at least one was accepted.
 *
 * @param entries - Section records to append.
 * @returns Records actually added.
 * @see {@link addRuntimeSections}
 */
export function appendScheduleEntries(entries: HydratedSection[]): HydratedSection[] {
  const additions = addRuntimeSections(entries);
  if (additions.length) persistRuntimeSchedule();
  return additions;
}

/**
 * Converts the runtime schedule back into workspace references and persists it.
 *
 * @returns Whether workspace persistence succeeded.
 * @see {@link createWorkspace}
 * @see {@link persistWorkspace}
 */
function persistRuntimeSchedule(): boolean {
  const schedule = getActiveScheduleRecord();
  if (!schedule) return false;
  schedule.section_refs = createSectionReferences(getRuntimeSchedule()).sectionRefs;
  return persistWorkspace(currentWorkspace);
}

/**
 * Adds selected lecture/lab records while assigning their shared schedule group.
 *
 * @param sectionRecords - Selected section records.
 * @param [scheduleGroupId=null] - Group ID linking related sections.
 * @returns Records accepted by the runtime schedule.
 * @see {@link appendScheduleEntries}
 */
export function addSectionSelection(sectionRecords: HydratedSection[], scheduleGroupId: string | null = null): HydratedSection[] {
  const entries = (Array.isArray(sectionRecords) ? sectionRecords : []).map(
    (section) => ({
      ...section,
      schedule_group_id: scheduleGroupId || null,
    }),
  );
  return appendScheduleEntries(entries);
}
/**
 * Removes a section and any entries sharing its schedule group, then persists.
 * Accepts either a complete section key or a section ID.
 *
 * @param sectionId - Section key or section ID to remove.
 * @returns `true` when a matching entry was removed.
 * @see {@link persistRuntimeSchedule}
 */
export function removeScheduleEntry(sectionId: string | number): boolean {
  const normalizedId = String(sectionId);
  const matchedKey = scheduleSectionOrder.find((key) =>
    normalizedId.includes(":")
      ? key === normalizedId
      : String(sectionRecordsByKey.get(key)?.section_id) === normalizedId,
  );
  const matchedEntry = matchedKey ? sectionRecordsByKey.get(matchedKey) : null;
  if (!matchedEntry) return false;
  const scheduleGroupId = matchedEntry.schedule_group_id;
  const keysToRemove = scheduleSectionOrder.filter((key) => {
    const entry = sectionRecordsByKey.get(key);
    if (!entry) return false;
    if (scheduleGroupId) return entry.schedule_group_id === scheduleGroupId;
    if (normalizedId.includes(":"))
      return key === matchedKey;
    return String(entry.section_id) === String(sectionId);
  });
  keysToRemove.forEach((key) => sectionRecordsByKey.delete(key));
  scheduleSectionOrder = scheduleSectionOrder.filter(
    (key) => !keysToRemove.includes(key),
  );
  persistRuntimeSchedule();
  return true;
}
/**
 * Removes every runtime schedule entry and persists the empty schedule.
 *
 * @returns Empty runtime schedule.
 * @see {@link replaceSchedule}
 */
export function clearSchedule(): HydratedSection[] {
  return replaceSchedule([]);
}
