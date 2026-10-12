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

let currentWorkspace = null;
const sectionRecordsByKey = new Map();
let scheduleSectionOrder = [];
const failedTermKeys = new Set();

/**
 * Returns the stable term/section key used by the runtime indexes.
 *
 * @param {Object} section - Section record containing `term_slug` and `section_id`.
 * @returns {string|null} Existing section key, derived key, or `null` for invalid data.
 */
function getSectionRecordKey(section) {
  if (!section || !section.section_id || !section.term_slug) return null;
  if (section.section_key) return String(section.section_key);
  return `${String(section.term_slug)}:${String(section.section_id)}`;
}

/**
 * Returns the persisted default schedule from the current workspace.
 *
 * @returns {Object|null} Default schedule metadata, or `null` before initialization.
 */
function getDefaultSchedule() {
  return currentWorkspace && currentWorkspace.schedules
    ? currentWorkspace.schedules.default
    : null;
}

/**
 * Returns runtime section records in their insertion order.
 *
 * @returns {Object[]} Hydrated schedule sections currently in memory.
 */
function getRuntimeSchedule() {
  return scheduleSectionOrder
    .map((key) => sectionRecordsByKey.get(key))
    .filter(Boolean);
}

/**
 * Replaces the runtime index with valid, unique section records.
 *
 * @param {Object[]} scheduleData - Section records to install.
 * @returns {void}
 * @see {@link isValidCourseEntry}
 */
function replaceRuntimeSchedule(scheduleData) {
  sectionRecordsByKey.clear();
  scheduleSectionOrder = [];
  (Array.isArray(scheduleData) ? scheduleData : []).forEach((entry) => {
    if (!isValidCourseEntry(entry)) return;
    const key = getSectionRecordKey(entry);
    if (!key || sectionRecordsByKey.has(key)) return;
    sectionRecordsByKey.set(key, entry);
    scheduleSectionOrder.push(key);
  });
}

/**
 * Adds valid section records that are not already present in the runtime index.
 *
 * @param {Object[]} sectionData - Section records to append.
 * @returns {Object[]} Records actually added.
 * @see {@link isValidCourseEntry}
 */
function addRuntimeSections(sectionData) {
  const additions = [];
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
 * Clears runtime records and installs a newly hydrated schedule.
 *
 * @param {Object[]} sectionData - Hydrated section records.
 * @returns {void}
 * @see {@link addRuntimeSections}
 */
function replaceHydratedRuntimeSchedule(sectionData) {
  sectionRecordsByKey.clear();
  scheduleSectionOrder = [];
  addRuntimeSections(sectionData);
}

/**
 * Builds the stable key for a persisted section reference.
 *
 * @param {Object} reference - Reference containing term and section IDs.
 * @returns {string} Composite reference key.
 */
function sectionReferenceKey(reference) {
  return `${String(reference.term_slug)}:${String(reference.section_id)}`;
}

/**
 * Reduces a hydrated section entry to its persistable reference shape.
 *
 * @param {Object} entry - Section entry to reduce.
 * @returns {Object|null} Persistable reference, or `null` for invalid input.
 */
function toSectionReference(entry) {
  if (!entry || !entry.section_id || !entry.term_slug) return null;
  return {
    term_slug: String(entry.term_slug),
    section_id: String(entry.section_id),
    schedule_group_id: entry.schedule_group_id || null,
  };
}

/**
 * Creates a versioned workspace containing a deduplicated default schedule.
 *
 * @param {Object[]} scheduleData - Section entries to convert into references.
 * @param {string} [name=DEFAULT_SCHEDULE_NAME] - Schedule display name.
 * @returns {{workspace: Object, excludedCount: number}} Workspace and invalid-entry count.
 * @see {@link toSectionReference}
 */
export function createWorkspace(scheduleData, name = DEFAULT_SCHEDULE_NAME) {
  const seen = new Set();
  const sectionRefs = [];
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

  return {
    workspace: {
      version: SCHEDULE_WORKSPACE_VERSION,
      active_schedule_id: "default",
      schedules: {
        default: {
          id: "default",
          name: String(name || DEFAULT_SCHEDULE_NAME),
          section_refs: sectionRefs,
        },
      },
    },
    excludedCount,
  };
}

/**
 * Parses and validates serialized workspace data against the current version.
 *
 * @param {string} serialized - JSON workspace text from storage.
 * @returns {Object|null} Normalized workspace, or `null` when invalid.
 * @see {@link createWorkspace}
 */
export function parseStoredWorkspace(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    const schedule = parsed && parsed.schedules && parsed.schedules.default;
    if (
      !parsed ||
      parsed.version !== SCHEDULE_WORKSPACE_VERSION ||
      parsed.active_schedule_id !== "default" ||
      !schedule ||
      !Array.isArray(schedule.section_refs)
    )
      return null;

    const normalized = createWorkspace(
      schedule.section_refs.map((reference) => ({
        section_id: reference && reference.section_id,
        term_slug: reference && reference.term_slug,
        schedule_group_id: reference && reference.schedule_group_id,
      })),
      schedule.name,
    );
    return normalized.workspace;
  } catch (error) {
    return null;
  }
}

/**
 * Loads the persisted workspace or creates and persists an empty one.
 *
 * @returns {Object} Current workspace.
 * @see {@link parseStoredWorkspace}
 * @see {@link persistWorkspace}
 */
export function loadScheduleWorkspace() {
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
 * @returns {Object|null} Current workspace, or `null` before loading.
 */
export function getScheduleWorkspace() {
  return currentWorkspace;
}

/**
 * Updates and persists the default schedule's display name.
 *
 * @param {string} name - New schedule name.
 * @returns {boolean} Whether persistence succeeded; `false` if no schedule exists.
 * @see {@link persistWorkspace}
 */
export function updateScheduleWorkspaceName(name) {
  const workspace = currentWorkspace || loadScheduleWorkspace();
  const schedule = workspace && workspace.schedules && workspace.schedules.default;
  if (!schedule) return false;
  schedule.name = String(name || DEFAULT_SCHEDULE_NAME);
  return persistWorkspace(workspace);
}

/**
 * Serializes a workspace into local storage.
 *
 * @param {Object} workspace - Workspace to persist.
 * @returns {boolean} Whether local-storage persistence succeeded.
 */
function persistWorkspace(workspace) {
  try {
    localStorage.setItem(
      SCHEDULE_WORKSPACE_STORAGE_KEY,
      JSON.stringify(workspace),
    );
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Replaces persisted references after hydration and saves the workspace.
 *
 * @param {Object[]} sectionRefs - References retained after dataset resolution.
 * @returns {boolean} Whether persistence succeeded.
 * @see {@link persistWorkspace}
 */
function updateActiveScheduleReferences(sectionRefs) {
  const schedule = getDefaultSchedule();
  if (!schedule) return false;
  schedule.section_refs = sectionRefs;
  return persistWorkspace(currentWorkspace);
}

/**
 * Checks whether a section has the required fields for runtime storage.
 *
 * @param {Object} item - Candidate section entry.
 * @returns {boolean} `true` when required course fields and term are present.
 */
export function isValidCourseEntry(item) {
  return (
    !!item &&
    !!item.term_slug &&
    REQUIRED_COURSE_FIELDS.every((field) => item[field])
  );
}
/**
 * Loads workspace state and resets the transient runtime schedule.
 *
 * @returns {Object[]} Empty initialized runtime schedule.
 * @see {@link loadScheduleWorkspace}
 * @see {@link replaceRuntimeSchedule}
 */
export function initializeScheduleState() {
  currentWorkspace = loadScheduleWorkspace();
  replaceRuntimeSchedule([]);
  return getRuntimeSchedule();
}

/**
 * Returns the current hydrated runtime schedule.
 *
 * @returns {Object[]} Runtime section records.
 * @see {@link getRuntimeSchedule}
 */
export function getSchedule() {
  return getRuntimeSchedule();
}

/**
 * Looks up one runtime section by its stable key.
 *
 * @param {string} sectionKey - Term/section key to find.
 * @returns {Object|null} Matching section or `null`.
 */
export function getSectionRecord(sectionKey) {
  return sectionRecordsByKey.get(String(sectionKey)) || null;
}

/**
 * Returns the persisted default schedule metadata and references.
 *
 * @returns {Object|null} Active schedule, or `null` before workspace loading.
 * @see {@link getDefaultSchedule}
 */
export function getActiveSchedule() {
  return getDefaultSchedule();
}

/**
 * Resolves persisted references against term datasets and rebuilds runtime records.
 * Failed terms remain retained for retry; missing sections are omitted and counted.
 *
 * @param {Function} fetchDatasetByKey - Async loader returning a dataset with `sectionsBySln`.
 * @returns {Promise<{schedule: Object[], missingCount: number, failedCount: number, failedTerms: string[]}>}
 *   Hydrated schedule and resolution diagnostics.
 * @see {@link markTermLoadFailed}
 * @see {@link clearTermLoadFailure}
 */
export async function hydrateSchedule(fetchDatasetByKey) {
  const schedule = getDefaultSchedule();
  const references = schedule && Array.isArray(schedule.section_refs)
    ? schedule.section_refs
    : [];
  if (!references.length) {
    replaceHydratedRuntimeSchedule([]);
    return {
      schedule: [],
      missingCount: 0,
      failedCount: 0,
      failedTerms: [],
    };
  }
  if (typeof fetchDatasetByKey !== "function") {
    replaceHydratedRuntimeSchedule([]);
    return {
      schedule: [],
      missingCount: 0,
      failedCount: references.length,
      failedTerms: Array.from(new Set(references.map((reference) => reference.term_slug))),
    };
  }

  const referencesByTerm = new Map();
  references.forEach((reference) => {
    if (!referencesByTerm.has(reference.term_slug))
      referencesByTerm.set(reference.term_slug, []);
    referencesByTerm.get(reference.term_slug).push(reference);
  });

  const resolvedRecords = [];
  const retainedReferences = [];
  let missingCount = 0;
  let failedCount = 0;
  const failedTerms = [];

  await Promise.all(
    Array.from(referencesByTerm, async ([termSlug, termReferences]) => {
      let dataset;
      try {
        dataset = await fetchDatasetByKey(termSlug);
        clearTermLoadFailure(termSlug);
      } catch (error) {
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
      (order.get(getSectionRecordKey(left)) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(getSectionRecordKey(right)) ?? Number.MAX_SAFE_INTEGER),
  );
  retainedReferences.sort(
    (left, right) =>
      (order.get(sectionReferenceKey(left)) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(sectionReferenceKey(right)) ?? Number.MAX_SAFE_INTEGER),
  );
  failedTerms.sort();
  replaceHydratedRuntimeSchedule(resolvedRecords);
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
 * @param {string} termSlug - Term key to mark as failed.
 * @returns {void}
 * @see {@link getFailedTermKeys}
 */
export function markTermLoadFailed(termSlug) {
  if (termSlug) failedTermKeys.add(String(termSlug));
}

/**
 * Removes a term from the failed-load set after a successful retry.
 *
 * @param {string} termSlug - Term key to clear.
 * @returns {void}
 * @see {@link markTermLoadFailed}
 */
export function clearTermLoadFailure(termSlug) {
  failedTermKeys.delete(String(termSlug));
}

/**
 * Returns a snapshot of terms whose datasets failed to load.
 *
 * @returns {string[]} Failed term keys.
 */
export function getFailedTermKeys() {
  return Array.from(failedTermKeys);
}

/**
 * Returns failed term keys for the caller's retry workflow.
 *
 * @returns {string[]} Terms eligible for retry.
 * @see {@link getFailedTermKeys}
 */
export function retryFailedTerms() {
  return getFailedTermKeys();
}

/**
 * Replaces the runtime schedule, persists it, and returns the resulting records.
 *
 * @param {Object[]} scheduleData - Section records for the replacement schedule.
 * @returns {Object[]} Persisted runtime schedule.
 * @see {@link replaceRuntimeSchedule}
 * @see {@link persistRuntimeSchedule}
 */
export function replaceSchedule(scheduleData) {
  replaceRuntimeSchedule(scheduleData);
  persistRuntimeSchedule();
  return getRuntimeSchedule();
}
/**
 * Adds new runtime entries and persists only when at least one was accepted.
 *
 * @param {Object[]} entries - Section records to append.
 * @returns {Object[]} Records actually added.
 * @see {@link addRuntimeSections}
 */
export function appendScheduleEntries(entries) {
  const additions = addRuntimeSections(entries);
  if (additions.length) persistRuntimeSchedule();
  return additions;
}

/**
 * Converts the runtime schedule back into workspace references and persists it.
 *
 * @returns {boolean} Whether workspace persistence succeeded.
 * @see {@link createWorkspace}
 * @see {@link persistWorkspace}
 */
function persistRuntimeSchedule() {
  const schedule = getDefaultSchedule();
  const name = schedule ? schedule.name : DEFAULT_SCHEDULE_NAME;
  const nextWorkspace = createWorkspace(getRuntimeSchedule(), name);
  currentWorkspace = nextWorkspace.workspace;
  return persistWorkspace(currentWorkspace);
}

/**
 * Adds selected lecture/lab records while assigning their shared schedule group.
 *
 * @param {Object[]} sectionRecords - Selected section records.
 * @param {string|null} [scheduleGroupId=null] - Group ID linking related sections.
 * @returns {Object[]} Records accepted by the runtime schedule.
 * @see {@link appendScheduleEntries}
 */
export function addSectionSelection(sectionRecords, scheduleGroupId = null) {
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
 * @param {string|number} sectionId - Section key or section ID to remove.
 * @returns {boolean} `true` when a matching entry was removed.
 * @see {@link persistRuntimeSchedule}
 */
export function removeScheduleEntry(sectionId) {
  const normalizedId = String(sectionId);
  const matchedKey = scheduleSectionOrder.find((key) =>
    normalizedId.includes(":")
      ? key === normalizedId
      : String(sectionRecordsByKey.get(key).section_id) === normalizedId,
  );
  const matchedEntry = matchedKey ? sectionRecordsByKey.get(matchedKey) : null;
  if (!matchedEntry) return false;
  const scheduleGroupId = matchedEntry.schedule_group_id;
  const keysToRemove = scheduleSectionOrder.filter((key) => {
    const entry = sectionRecordsByKey.get(key);
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
 * @returns {Object[]} Empty runtime schedule.
 * @see {@link replaceSchedule}
 */
export function clearSchedule() {
  return replaceSchedule([]);
}
