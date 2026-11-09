/**
 * @fileoverview Creates, parses, and imports browser-based schedule share codes.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import {
  DEFAULT_SCHEDULE_NAME,
  MAX_SCHEDULE_SECTIONS,
  SHARE_CODE_PREFIX,
  SCHEDULE_NAME_MAX_LENGTH,
} from "./constants.js";
import type { CatalogCourse, HydratedSection, ParsedShareCode, ShareTerm, SectionIndexEntry } from "../types.js";

interface ShareActions {
  shareScheduleCode(): Promise<void>;
  importScheduleFromShareCode(): Promise<void>;
}

interface ShareOptions {
  getSchedule(): HydratedSection[];
  replaceSchedule(schedule: HydratedSection[]): HydratedSection[];
  getName(): string;
  setName(name?: string): void;
  refreshSchedule(): void;
  showSchedulePane(): void;
}

/**
 * Encodes UTF-8 text as URL-safe base64 without padding.
 *
 * @param value - Text to encode.
 * @returns URL-safe base64 representation.
 * @see {@link decodeBase64Url}
 */
export function encodeBase64Url(value: string): string {
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
/**
 * Decodes URL-safe, optionally unpadded base64 into UTF-8 text.
 *
 * @param value - Encoded value to decode.
 * @returns Decoded UTF-8 text.
 * @see {@link encodeBase64Url}
 */
export function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
/**
 * Groups schedule sections by term and limits the share payload size.
 *
 * @param schedule - Current schedule section records.
 * @returns Unique section IDs grouped by term.
 */
export function getCurrentScheduleTerms(schedule: HydratedSection[]): ShareTerm[] {
  const terms = new Map<string, Set<string>>();
  let totalSections = 0;
  schedule.forEach((item) => {
    if (totalSections >= MAX_SCHEDULE_SECTIONS) return;
    const slug = String(item.term_slug || "");
    const sln = String(item.section_id || "");
    if (!slug || !sln) return;
    const slns = terms.get(slug) ?? new Set<string>();
    terms.set(slug, slns);
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
/**
 * Serializes a schedule name and term/section references into a share code.
 *
 * @param schedule - Schedule section records to reference.
 * @param name - Schedule name stored in the payload.
 * @returns Prefixed share code suitable for copying or URLs.
 * @see {@link getCurrentScheduleTerms}
 * @see {@link encodeBase64Url}
 */
export function buildShareCode(schedule: HydratedSection[], name: string): string {
  return `${SHARE_CODE_PREFIX}${encodeBase64Url(JSON.stringify({ n: name, terms: getCurrentScheduleTerms(schedule) }))}`;
}
/**
 * Validates and decodes a share code into a bounded import payload.
 *
 * @param code - Share code to parse.
 * @returns Parsed import data.
 * @throws {Error} If the prefix, payload, or section list is invalid.
 * @see {@link decodeBase64Url}
 */
export function parseShareCode(code: string): ParsedShareCode {
  const normalizedCode = (code || "").trim();
  if (!normalizedCode.startsWith(SHARE_CODE_PREFIX))
    throw new Error("That does not look like a Crimson Scheduler share code.");
  const payload: unknown = JSON.parse(
    decodeBase64Url(normalizedCode.slice(SHARE_CODE_PREFIX.length)),
  );
  if (!payload || typeof payload !== "object") throw new Error("Invalid share code payload.");
  const sharePayload = payload as { n?: unknown; terms?: unknown };
  const name =
    String(sharePayload.n || DEFAULT_SCHEDULE_NAME)
      .trim()
      .slice(0, SCHEDULE_NAME_MAX_LENGTH) || DEFAULT_SCHEDULE_NAME;
  const terms: ShareTerm[] = [];
  const seen = new Set<string>();
  let totalSections = 0;
  if (Array.isArray(sharePayload.terms))
    sharePayload.terms.forEach((term: unknown) => {
      if (!term || typeof term !== "object") return;
      const record = term as { slug?: unknown; slns?: unknown };
      if (
        totalSections >= MAX_SCHEDULE_SECTIONS ||
        !term ||
        !record.slug ||
        !Array.isArray(record.slns)
      )
        return;
      const slug = String(record.slug);
      const slns: string[] = [];
      (record.slns as unknown[]).forEach((sln) => {
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
/**
 * Copies text when the browser exposes a secure clipboard API.
 *
 * @param text - Text to copy.
 * @returns `true` when copied, otherwise `false`.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}
/**
 * Fetches referenced term datasets and reconstructs schedule section records.
 * Missing section IDs are reported separately so the import flow can notify the user.
 *
 * @param terms - Term/section references from a share code.
 * @returns Resolved schedule and missing IDs.
 * @see {@link parseShareCode}
 */
export async function fetchScheduleForTerms(terms: ShareTerm[]): Promise<{ schedule: HydratedSection[]; missing_section_ids: string[] }> {
  const datasets = new Map<string, Awaited<ReturnType<typeof window.CourseApi.fetchDatasetByKey>>>();
  for (const term of terms)
    if (!datasets.has(term.slug))
      datasets.set(term.slug, await window.CourseApi.fetchDatasetByKey(term.slug));
  const matches: Array<{ dataset: Awaited<ReturnType<typeof window.CourseApi.fetchDatasetByKey>>; course: CatalogCourse; section: SectionIndexEntry["section"] }> = [];
  const missingSectionIds: string[] = [];
  terms.forEach((term) => {
    const dataset = datasets.get(term.slug)!;
    term.slns.forEach((sln) => {
      const match = dataset.sectionsBySln.get(String(sln));
      if (match) matches.push({ dataset, ...match });
      else missingSectionIds.push(String(sln));
    });
  });
  const groupedIds = new Map<string, string[]>();
  matches.forEach((match) => {
    const key = `${match.dataset.key}:${match.course.id}`;
    const sectionIds = groupedIds.get(key) ?? [];
    sectionIds.push(String(match.section.section_id));
    groupedIds.set(key, sectionIds);
  });
  const schedule = matches.map((match) => {
    const key = `${match.dataset.key}:${match.course.id}`;
    const ids = groupedIds.get(key) ?? [];
    return {
      ...match.section,
      term_slug: match.dataset.key,
      section_key:
        match.section.section_key ||
        `${match.dataset.key}:${match.section.section_id}`,
      schedule_group_id: ids.length > 1 ? ids.join("-") : null,
    };
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
}: ShareOptions): ShareActions {
  /**
   * Creates share/import actions wired to the schedule state and UI callbacks.
   * The returned methods are consumed by the page's sharing controls.
   *
   * @returns Sharing actions for creating and importing schedule codes.
   * @see {@link buildShareCode}
   * @see {@link fetchScheduleForTerms}
   */
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
      } catch {
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
        if (error && typeof error === "object" && "rateLimited" in error && error.rateLimited) return;
        const message = error instanceof Error ? error.message : "That share code could not be imported.";
        window.alert(message);
      }
    },
  };
}
