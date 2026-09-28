const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function relativeUnit(elapsedMs) {
  if (elapsedMs < MINUTE_MS) return { value: 0, unit: "minute" };
  if (elapsedMs < HOUR_MS)
    return { value: -Math.floor(elapsedMs / MINUTE_MS), unit: "minute" };
  if (elapsedMs < DAY_MS)
    return { value: -Math.floor(elapsedMs / HOUR_MS), unit: "hour" };
  return { value: -Math.floor(elapsedMs / DAY_MS), unit: "day" };
}

export function formatCatalogFreshness(timestamp, now = Date.now()) {
  const updatedAt = new Date(timestamp);
  if (Number.isNaN(updatedAt.getTime())) return null;

  const elapsedMs = Math.max(0, now - updatedAt.getTime());
  const { value, unit } = relativeUnit(elapsedMs);
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
    .format(value, unit)
    .replace(/^now$/, "just now");
  const exact = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(updatedAt);

  return {
    exact,
    text: `Course catalog updated ${relative}`,
  };
}

export function initializeCatalogFreshness() {
  const container = document.getElementById("catalogFreshness");
  const time = document.getElementById("catalogGeneratedAt");
  if (!container || !time || !time.dateTime) return;

  const render = () => {
    const freshness = formatCatalogFreshness(time.dateTime);
    if (!freshness) return;
    time.textContent = freshness.text;
    time.title = `Catalog timestamp: ${freshness.exact}`;
    time.setAttribute("aria-label", `${freshness.text}. ${time.title}`);
    container.hidden = false;
  };

  render();
  window.setInterval(render, MINUTE_MS);
}
