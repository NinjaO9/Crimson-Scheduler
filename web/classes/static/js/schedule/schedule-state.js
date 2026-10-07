import {
  DEFAULT_SCHEDULE_NAME,
  REQUIRED_COURSE_FIELDS,
  SCHEDULE_NAME_STORAGE_KEY,
  SCHEDULE_STORAGE_KEY,
  SCHEDULE_WORKSPACE_STORAGE_KEY,
  SCHEDULE_WORKSPACE_VERSION,
} from "./constants.js";

let currentSchedule = [];
let currentWorkspace = null;
let lastMigrationReport = { migrated: false, excludedCount: 0 };

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
  currentSchedule = loadSchedule();
  return currentSchedule;
}

export function getSchedule() {
  return currentSchedule;
}

export function replaceSchedule(scheduleData) {
  currentSchedule = scheduleData;
  persistSchedule(currentSchedule);
  return currentSchedule;
}
export function appendScheduleEntries(entries) {
  const additions = entries.filter(
    (entry) =>
      !currentSchedule.some(
        (item) => String(item.section_id) === String(entry.section_id),
      ),
  );
  if (additions.length) replaceSchedule([...currentSchedule, ...additions]);
  return additions;
}
export function removeScheduleEntry(sectionId) {
  const matchedEntry = currentSchedule.find(
    (entry) => String(entry.section_id) === String(sectionId),
  );
  if (!matchedEntry) return false;
  const scheduleGroupId = matchedEntry.schedule_group_id;
  currentSchedule = currentSchedule.filter((entry) => {
    if (scheduleGroupId) return entry.schedule_group_id !== scheduleGroupId;
    return String(entry.section_id) !== String(sectionId);
  });
  persistSchedule(currentSchedule);
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
