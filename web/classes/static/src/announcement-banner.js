/**
 * @fileoverview Loads and displays the remotely configured global announcement.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

const REMOTE_CONFIG_URL = "https://ninjao9.github.io/Crimson-Scheduler/api/v1/announcements/global.json";
const LOCAL_CONFIG_URL = "/static/notifications/global-announcement.local.json";
const REQUEST_TIMEOUT_MS = 2000;
const STORAGE_KEY_PREFIX = "crimson-announcement-dismissed:";
const ALLOWED_TYPES = new Set(["information", "warning"]);
const MIN_TEXT_SIZE_PX = 12;
const TEXT_SIZE_STEP_PX = 0.25;
const MAX_TEXT_LINES = 3;

/** 
 * @typedef {{
 *              schemaVersion: 1, 
 *              enabled: boolean,
 *              id: string,
 *              type: string,
 *              text: string,
 *              link?: 
 *               {label: string,
 *                url: string},
 *              dismissible: boolean,
 *              startsAt?: string,
 *              expiresAt?: string
 *         }} Announcement 
 */

/**
 * Verifies that the provided value is a record (object)
 * @param {*} value 
 * @returns {boolean}
 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 
 * Returns the configuration URL for the current environment.
 */
export function announcementConfigUrl(hostname = window.location.hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)
    ? LOCAL_CONFIG_URL
    : REMOTE_CONFIG_URL;
}

/**
 * Checks if the provided value is a date
 * @param {*} value 
 * @returns {boolean}
 */
function isDate(value) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

/**
 * Validates links within announcement to be only http or https.
 */
function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Validates untrusted announcement JSON and returns a normalized record.
 * @param {Object} Announcement - JSON from crimson-data 
 * @returns {Announcement} Structured Announcement object
 */
export function parseAnnouncement(value) {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.enabled !== "boolean" ||
      typeof value.id !== "string" || !value.id.trim() ||
      typeof value.type !== "string" || !ALLOWED_TYPES.has(value.type) ||
      typeof value.text !== "string" || !value.text.trim() ||
      typeof value.dismissible !== "boolean") return null;

  if (value.startsAt !== undefined && !isDate(value.startsAt)) return null;
  if (value.expiresAt !== undefined && !isDate(value.expiresAt)) return null;

  let link;
  if (value.link !== undefined) {
    if (!isRecord(value.link) || typeof value.link.label !== "string" || !value.link.label.trim()) return null;
    const url = safeHttpUrl(value.link.url);
    if (!url) return null;
    link = { label: value.link.label.trim(), url };
  }

  return {
    schemaVersion: 1,
    enabled: value.enabled,
    id: value.id.trim(),
    type: value.type,
    text: value.text.trim(),
    ...(link ? { link } : {}),
    dismissible: value.dismissible,
    ...(value.startsAt ? { startsAt: value.startsAt } : {}),
    ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
  };
}

/** 
 * Returns whether an enabled announcement is active at the supplied time.
 */
export function isAnnouncementActive(announcement, now = Date.now()) {
  if (!announcement?.enabled) return false;
  if (announcement.startsAt && Date.parse(announcement.startsAt) > now) return false;
  if (announcement.expiresAt && Date.parse(announcement.expiresAt) <= now) return false;
  return true;
}

/** 
 * Loads and validates announcement JSON without allowing a network error to escape.
 */
export async function fetchAnnouncement(
  fetchImpl = window.fetch.bind(window),
  configUrl = announcementConfigUrl(),
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(configUrl, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) return null;
    return parseAnnouncement(await response.json());
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Checks if the provided announcement was dismissed.
 * @param {*} id - id of the announcement
 * @returns {boolean}
 */
function wasDismissed(id) {
  try {
    return window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`) === "true";
  } catch {
    return false;
  }
}

/**
 * If the user dismisses an announcement, persist it so that the announcement doesn't come back.
 * @param {*} id - id of announcement 
 */
function persistDismissal(id) {
  try {
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, "true");
  } catch {
    // Dismissal still applies for the current page if storage is unavailable.
  }
}

/**
 * Returns the largest readable font size that fits the supplied predicate.
 * @param {number} maximumSize - Font size supplied by CSS.
 * @param {(size: number) => boolean} fits - Determines whether the size fits.
 * @returns {number} The selected font size.
 */
export function fittedFontSize(maximumSize, fits) {
  let size = maximumSize;
  while (size > MIN_TEXT_SIZE_PX && !fits(size)) {
    size = Math.max(MIN_TEXT_SIZE_PX, size - TEXT_SIZE_STEP_PX);
  }
  return size;
}

/**
 * Determines whether text fits within the maximum visible line count.
 * @param {HTMLElement} text - Announcement text element.
 * @param {number} fontSize - Candidate font size in pixels.
 * @returns {boolean} Whether the complete text fits.
 */
function fitsAnnouncementLines(text, fontSize) {
  if (text.clientWidth === 0) return true;
  const probe = text.cloneNode(true);
  probe.removeAttribute("id");
  probe.style.display = "block";
  probe.style.fontSize = `${fontSize}px`;
  probe.style.height = "auto";
  probe.style.maxHeight = "none";
  probe.style.overflow = "visible";
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.webkitLineClamp = "unset";
  probe.style.lineClamp = "unset";
  probe.style.width = `${text.clientWidth}px`;
  document.body.append(probe);
  const lineHeight = Number.parseFloat(window.getComputedStyle(probe).lineHeight) || fontSize * 1.45;
  const fits = probe.scrollHeight <= lineHeight * MAX_TEXT_LINES + 0.5;
  probe.remove();
  return fits;
}

/**
 * Shrinks announcement text only when it exceeds three visible lines.
 * CSS truncates remaining overflow after the readable minimum is reached.
 *
 * @param {HTMLElement} text - Announcement text element.
 */
export function fitAnnouncementText(text) {
  text.style.removeProperty("font-size");
  const maximumSize = Number.parseFloat(window.getComputedStyle(text).fontSize);
  if (!Number.isFinite(maximumSize)) return;
  const size = fittedFontSize(maximumSize, (candidate) => fitsAnnouncementLines(text, candidate));
  if (size < maximumSize) text.style.fontSize = `${size}px`;
}

/**
 * Updates the scheduler's reserved height to the banner's rendered height.
 * @param {HTMLElement} banner - Active announcement banner.
 */
export function updateAnnouncementHeight(banner) {
  document.documentElement.style.setProperty("--global-announcement-height", `${banner.offsetHeight}px`);
}

/** 
 * Clears the dynamic banner-height reservation after dismissal.
 */
function clearAnnouncementHeight() {
  document.documentElement.style.removeProperty("--global-announcement-height");
}

/**
 * Refits the text and updates scheduler space when banner dimensions change.
 *
 * @param {HTMLElement} banner - Active announcement banner.
 * @param {HTMLElement} text - Announcement text element.
 * @returns {() => void} Stops observing the text element.
 */
function observeAnnouncementLayout(banner, text) {
  const updateLayout = () => {
    fitAnnouncementText(text);
    updateAnnouncementHeight(banner);
  };
  if ("ResizeObserver" in window) {
    const observer = new window.ResizeObserver(updateLayout);
    observer.observe(banner);
    observer.observe(text);
    return () => observer.disconnect();
  }

  const onResize = updateLayout;
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}

/**
 * Renders the announcement banner for the site.
 * @param {Announcement} announcement - announcement metadata that will be parsed.
 * @param {Document} root - root document to pin the announcement to.
 * @returns 
 */
function renderAnnouncement(announcement, root = document) {
  const banner = root.getElementById("globalAnnouncement");
  const text = root.getElementById("globalAnnouncementText");
  const link = root.getElementById("globalAnnouncementLink");
  const dismiss = root.getElementById("globalAnnouncementDismiss");
  if (!banner || !text || !link || !dismiss) return;
  if (!isAnnouncementActive(announcement) || wasDismissed(announcement.id)) return;

  banner.dataset.type = announcement.type;
  banner.setAttribute("aria-live", announcement.type === "critical" ? "assertive" : "polite");
  text.textContent = announcement.text;
  text.title = announcement.text;
  if (announcement.link) {
    link.textContent = announcement.link.label;
    link.href = announcement.link.url;
    link.hidden = false;
    if (new URL(announcement.link.url).origin !== window.location.origin) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  }
  banner.hidden = false;
  fitAnnouncementText(text);
  updateAnnouncementHeight(banner);
  const stopObserving = observeAnnouncementLayout(banner, text);

  if (announcement.dismissible) {
    dismiss.hidden = false;
    dismiss.addEventListener("click", () => {
      persistDismissal(announcement.id);
      stopObserving();
      banner.hidden = true;
      clearAnnouncementHeight();
    }, { once: true });
  }
}

/** 
 * Fetches and renders the site-wide announcement asynchronously.
 */
export async function initializeAnnouncementBanner() {
  const announcement = await fetchAnnouncement();
  if (announcement) renderAnnouncement(announcement);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { void initializeAnnouncementBanner(); }, { once: true });
} else {
  void initializeAnnouncementBanner();
}
