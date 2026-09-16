import { RATE_LIMIT_TOAST_ID } from "./constants.js";
import { createElementWithText } from "./dom.js";

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
