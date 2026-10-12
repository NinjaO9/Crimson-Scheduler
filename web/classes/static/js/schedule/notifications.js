/**
 * @fileoverview Provides user-facing notifications for schedule actions and errors. Currently outdated due to lack of Redis usage in current application.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { RATE_LIMIT_TOAST_ID } from "./constants.js";
import { createElementWithText } from "./dom.js";

/**
 * Finds or creates the live region used for rate-limit notifications.
 *
 * @returns {HTMLDivElement} The rate-limit toast element.
 */
export function ensureRateLimitToast() {
  let toast = document.getElementById(RATE_LIMIT_TOAST_ID);
  if (toast) return toast;
  toast = createElementWithText("div", "rate-limit-toast", "");
  toast.id = RATE_LIMIT_TOAST_ID;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.appendChild(toast);
  return toast;
}
/**
 * Displays a temporary rate-limit message, replacing any prior dismissal timer.
 *
 * @param {string} message - Message supplied by the rate-limit response.
 * @returns {void}
 * @see {@link ensureRateLimitToast}
 */
export function showRateLimitToast(message) {
  const toast = ensureRateLimitToast();
  toast.textContent =
    message || "You are sending requests too quickly. Please wait a moment.";
  toast.classList.add("is-visible");
  if (toast.hideTimer) {
    window.clearTimeout(toast.hideTimer);
  }
  toast.hideTimer = window.setTimeout(
    () => toast.classList.remove("is-visible"),
    3500,
  );
}
/**
 * Extracts a human-readable rate-limit message from an HTMX/XHR response.
 *
 * @param {XMLHttpRequest|null|undefined} xhr - Response to inspect.
 * @param {string} fallbackMessage - Message returned when no response message is available.
 * @returns {string} The extracted or fallback message.
 */
export function getRateLimitMessageFromResponse(xhr, fallbackMessage) {
  if (!xhr) return fallbackMessage;
  const headerMessage =
    xhr.getResponseHeader && xhr.getResponseHeader("X-Rate-Limit-Message");
  if (headerMessage) return headerMessage;
  if (xhr.responseText) {
    try {
      const parsed = JSON.parse(xhr.responseText);
      if (parsed && parsed.message) return parsed.message;
    } catch (error) {
      // Some error responses are HTML rather than JSON, so extract their visible text as a fallback.
      const parsedHtml = new DOMParser().parseFromString(
        xhr.responseText,
        "text/html",
      );
      const text =
        parsedHtml.body.textContent && parsedHtml.body.textContent.trim();
      if (text) return text;
    }
  }
  return fallbackMessage;
}
