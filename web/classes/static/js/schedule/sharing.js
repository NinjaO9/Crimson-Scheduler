import {
  DEFAULT_SCHEDULE_NAME,
  MAX_SCHEDULE_SECTIONS,
  SHARE_CODE_PREFIX,
  SCHEDULE_NAME_MAX_LENGTH,
} from "./constants.js";

export function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
export function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
export function getCurrentScheduleTerms(schedule) {
  const terms = new Map();
  let totalSections = 0;
  schedule.forEach((item) => {
    if (totalSections >= MAX_SCHEDULE_SECTIONS) return;
    const slug = String(item.term_slug || "");
    const sln = String(item.section_id || "");
    if (!slug || !sln) return;
    if (!terms.has(slug)) terms.set(slug, new Set());
    const slns = terms.get(slug);
    if (!slns.has(sln)) {
      slns.add(sln);
      totalSections += 1;
    }
  });
  return Array.from(terms, ([slug, slns]) => ({
    slug,
    slns: Array.from(slns),
  }));
}
export function buildShareCode(schedule, name) {
  return `${SHARE_CODE_PREFIX}${encodeBase64Url(JSON.stringify({ n: name, terms: getCurrentScheduleTerms(schedule) }))}`;
}
export function parseShareCode(code) {
  const normalizedCode = (code || "").trim();
  if (!normalizedCode.startsWith(SHARE_CODE_PREFIX))
    throw new Error("That does not look like a Crimson Scheduler share code.");
  const payload = JSON.parse(
    decodeBase64Url(normalizedCode.slice(SHARE_CODE_PREFIX.length)),
  );
  const name =
    String(payload.n || DEFAULT_SCHEDULE_NAME)
      .trim()
      .slice(0, SCHEDULE_NAME_MAX_LENGTH) || DEFAULT_SCHEDULE_NAME;
  const terms = [];
  const seen = new Set();
  let totalSections = 0;
  if (Array.isArray(payload.terms))
    payload.terms.forEach((term) => {
      if (
        totalSections >= MAX_SCHEDULE_SECTIONS ||
        !term ||
        !term.slug ||
        !Array.isArray(term.slns)
      )
        return;
      const slug = String(term.slug);
      const slns = [];
      term.slns.forEach((sln) => {
        const normalizedSln = String(sln || "");
        const key = `${slug}:${normalizedSln}`;
        if (
          normalizedSln &&
          !seen.has(key) &&
          totalSections < MAX_SCHEDULE_SECTIONS
        ) {
          seen.add(key);
          slns.push(normalizedSln);
          totalSections += 1;
        }
      });
      if (slns.length) terms.push({ slug, slns });
    });
  if (!terms.length)
    throw new Error("This share code does not contain any sections.");
  return { name, terms };
}
export async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}
export async function fetchScheduleForTerms(terms) {
  const datasets = new Map();
  for (const term of terms)
    if (!datasets.has(term.slug))
      datasets.set(term.slug, await CourseApi.fetchDatasetByKey(term.slug));
  const matches = [];
  const missingSectionIds = [];
  terms.forEach((term) => {
    const dataset = datasets.get(term.slug);
    term.slns.forEach((sln) => {
      const match = dataset.sectionsBySln.get(String(sln));
      if (match) matches.push({ dataset, ...match });
      else missingSectionIds.push(String(sln));
    });
  });
  const groupedIds = new Map();
  matches.forEach((match) => {
    const key = `${match.dataset.key}:${match.course.id}`;
    if (!groupedIds.has(key)) groupedIds.set(key, []);
    groupedIds.get(key).push(String(match.section.section_id));
  });
  const schedule = matches.map((match) => {
    const key = `${match.dataset.key}:${match.course.id}`;
    const ids = groupedIds.get(key);
    return CourseApi.toScheduleEntry(
      match.section,
      ids.length > 1 ? ids.join("-") : null,
    );
  });
  return { schedule, missing_section_ids: missingSectionIds };
}
export function initializeScheduleSharing({
  getSchedule,
  replaceSchedule,
  getName,
  setName,
  refreshSchedule,
  showSchedulePane,
}) {
  return {
    async shareScheduleCode() {
      setName();
      if (!getCurrentScheduleTerms(getSchedule()).length) {
        window.alert("Add at least one class before creating a share code.");
        return;
      }
      const shareCode = buildShareCode(getSchedule(), getName());
      try {
        if (await copyTextToClipboard(shareCode)) {
          window.alert("Share code copied to your clipboard.");
          return;
        }
      } catch (error) {
        /* Prompt fallback below. */
      }
      window.prompt("Copy this share code:", shareCode);
    },
    async importScheduleFromShareCode() {
      const code = window.prompt("Paste a Crimson Scheduler share code:");
      if (!code) return;
      try {
        const parsedCode = parseShareCode(code);
        if (
          !window.confirm(
            `Import "${parsedCode.name}" and replace your current schedule?`,
          )
        )
          return;
        const data = await fetchScheduleForTerms(parsedCode.terms);
        if (!data.schedule.length) {
          window.alert("No matching sections were found for that share code.");
          return;
        }
        setName(parsedCode.name);
        replaceSchedule(data.schedule);
        refreshSchedule();
        showSchedulePane();
        if (data.missing_section_ids && data.missing_section_ids.length)
          window.alert(
            `Imported ${data.schedule.length} section(s). ${data.missing_section_ids.length} section(s) could not be found.`,
          );
      } catch (error) {
        if (error && error.rateLimited) return;
        window.alert(error.message || "That share code could not be imported.");
      }
    },
  };
}
