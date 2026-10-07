import {
  DEFAULT_SCHEDULE_NAME,
  REQUIRED_COURSE_FIELDS,
  SCHEDULE_NAME_STORAGE_KEY,
  SCHEDULE_STORAGE_KEY,
  SCHEDULE_WORKSPACE_STORAGE_KEY,
  SCHEDULE_WORKSPACE_VERSION,
} from "./constants.js";

let currentWorkspace = null;
let lastMigrationReport = { migrated: false, excludedCount: 0 };
const sectionRecordsByKey = new Map();
let scheduleSectionOrder = [];
const failedTermKeys = new Set();

function getSectionRecordKey(section) {
  if (!section || !section.section_id) return null;
  if (section.section_key) return String(section.section_key);
  if (section.term_slug)
    return `${String(section.term_slug)}:${String(section.section_id)}`;
  return `legacy:${String(section.section_id)}`;
}

function getDefaultSchedule() {
  return currentWorkspace && currentWorkspace.schedules
    ? currentWorkspace.schedules.default
    : null;
}

function getRuntimeSchedule() {
  return scheduleSectionOrder
    .map((key) => sectionRecordsByKey.get(key))
    .filter(Boolean);
}

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

function replaceHydratedRuntimeSchedule(sectionData) {
  sectionRecordsByKey.clear();
  scheduleSectionOrder = [];
  addRuntimeSections(sectionData);
}

function getStoredScheduleName() {
  try {
    return (
      localStorage.getItem(SCHEDULE_NAME_STORAGE_KEY) || DEFAULT_SCHEDULE_NAME
    );
  } catch (error) {
    return DEFAULT_SCHEDULE_NAME;
  }
}

function sectionReferenceKey(reference) {
  return `${String(reference.term_slug)}:${String(reference.section_id)}`;
}

function toSectionReference(entry) {
  if (!entry || !entry.section_id || !entry.term_slug) return null;
  return {
    term_slug: String(entry.term_slug),
    section_id: String(entry.section_id),
    schedule_group_id: entry.schedule_group_id || null,
  };
}

export function createWorkspace(scheduleData, name = getStoredScheduleName()) {
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

export function loadScheduleWorkspace() {
  try {
    const storedWorkspace = localStorage.getItem(
      SCHEDULE_WORKSPACE_STORAGE_KEY,
    );
    if (storedWorkspace !== null) {
      const parsedWorkspace = parseStoredWorkspace(storedWorkspace);
      if (parsedWorkspace) {
        currentWorkspace = parsedWorkspace;
        lastMigrationReport = { migrated: false, excludedCount: 0 };
        return currentWorkspace;
      }
    }
  } catch (error) {
    console.warn("Unable to read schedule workspace from local storage:", error);
  }

  const migrated = createWorkspace(loadSchedule(), getStoredScheduleName());
  currentWorkspace = migrated.workspace;
  lastMigrationReport = {
    migrated: true,
    excludedCount: migrated.excludedCount,
  };
  persistWorkspace(currentWorkspace);
  return currentWorkspace;
}

export function getScheduleWorkspace() {
  return currentWorkspace;
}

export function getLastMigrationReport() {
  return lastMigrationReport;
}

export function updateScheduleWorkspaceName(name) {
  const workspace = currentWorkspace || loadScheduleWorkspace();
  const schedule = workspace && workspace.schedules && workspace.schedules.default;
  if (!schedule) return false;
  schedule.name = String(name || DEFAULT_SCHEDULE_NAME);
  return persistWorkspace(workspace);
}

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

function updateActiveScheduleReferences(sectionRefs) {
  const schedule = getDefaultSchedule();
  if (!schedule) return false;
  schedule.section_refs = sectionRefs;
  return persistWorkspace(currentWorkspace);
}

export function persistSchedule(scheduleData) {
  const nextWorkspace = createWorkspace(scheduleData, getStoredScheduleName());
  currentWorkspace = nextWorkspace.workspace;
  persistWorkspace(currentWorkspace);
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(scheduleData));
    return true;
  } catch (error) {
    return false;
  }
}

export function isValidCourseEntry(item) {
  return !!item && REQUIRED_COURSE_FIELDS.every((field) => item[field]);
}
export function parseStoredSchedule(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.filter(isValidCourseEntry) : [];
  } catch (error) {
    return [];
  }
}
export function loadSchedule() {
  try {
    const storedSchedule = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (storedSchedule !== null) return parseStoredSchedule(storedSchedule);
  } catch (error) {
    console.warn("Unable to read saved schedule from local storage:", error);
  }
  return [];
}
export function initializeScheduleState() {
  currentWorkspace = loadScheduleWorkspace();
  // Temporary compatibility bridge: fresh catalog hydration will replace this
  // legacy runtime read in a later refactor feature.
  replaceRuntimeSchedule(loadSchedule());
  return getRuntimeSchedule();
}

export function getSchedule() {
  return getRuntimeSchedule();
}

export function getScheduleSections() {
  return getRuntimeSchedule();
}

export function getSectionRecord(sectionKey) {
  return sectionRecordsByKey.get(String(sectionKey)) || null;
}

export function getActiveSchedule() {
  return getDefaultSchedule();
}

export function hydrateScheduleSections(sectionRecords) {
  const records = Array.isArray(sectionRecords) ? sectionRecords : [];
  const defaultSchedule = getDefaultSchedule();
  const references = defaultSchedule && Array.isArray(defaultSchedule.section_refs)
    ? defaultSchedule.section_refs
    : [];

  records.forEach((record) => {
    const key = getSectionRecordKey(record);
    if (key) sectionRecordsByKey.set(key, record);
  });

  if (!scheduleSectionOrder.length && references.length) {
    scheduleSectionOrder = references
      .map((reference) => sectionReferenceKey(reference))
      .filter((key) => sectionRecordsByKey.has(key));
  }
  return getRuntimeSchedule();
}

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
  // Keep the old serialized entries synchronized until the compatibility
  // bridge is removed after the remaining consumer migrations.
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(resolvedRecords));
  } catch (error) {
    /* The workspace references remain the authoritative persisted state. */
  }

  return {
    schedule: getRuntimeSchedule(),
    missingCount,
    failedCount,
    failedTerms,
  };
}

export function markTermLoadFailed(termSlug) {
  if (termSlug) failedTermKeys.add(String(termSlug));
}

export function clearTermLoadFailure(termSlug) {
  failedTermKeys.delete(String(termSlug));
}

export function getFailedTermKeys() {
  return Array.from(failedTermKeys);
}

export function retryFailedTerms() {
  return getFailedTermKeys();
}

export function replaceSchedule(scheduleData) {
  replaceRuntimeSchedule(scheduleData);
  persistSchedule(getRuntimeSchedule());
  return getRuntimeSchedule();
}
export function appendScheduleEntries(entries) {
  const additions = addRuntimeSections(entries);
  if (additions.length) persistSchedule(getRuntimeSchedule());
  return additions;
}
export function removeScheduleEntry(sectionId) {
  const matchedKey = scheduleSectionOrder.find(
    (key) => String(sectionRecordsByKey.get(key).section_id) === String(sectionId),
  );
  const matchedEntry = matchedKey ? sectionRecordsByKey.get(matchedKey) : null;
  if (!matchedEntry) return false;
  const scheduleGroupId = matchedEntry.schedule_group_id;
  const keysToRemove = scheduleSectionOrder.filter((key) => {
    const entry = sectionRecordsByKey.get(key);
    if (scheduleGroupId) return entry.schedule_group_id === scheduleGroupId;
    return String(entry.section_id) === String(sectionId);
  });
  keysToRemove.forEach((key) => sectionRecordsByKey.delete(key));
  scheduleSectionOrder = scheduleSectionOrder.filter(
    (key) => !keysToRemove.includes(key),
  );
  persistSchedule(getRuntimeSchedule());
  return true;
}
export function clearSchedule() {
  return replaceSchedule([]);
}
export function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split(";") : [];
  const prefix = `${name}=`;
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    if (cookie.startsWith(prefix))
      return decodeURIComponent(cookie.substring(prefix.length));
  }
  return "";
}
