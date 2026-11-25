import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  announcementConfigUrl,
  fetchAnnouncement,
  initializeAnnouncementBanner,
  isAnnouncementActive,
  parseAnnouncement,
} from "../web/classes/static/src/announcement-banner.js";

const validAnnouncement = {
  schemaVersion: 1,
  enabled: true,
  id: "registration-reminder",
  type: "warning",
  text: "Registration opens soon.",
  link: { label: "View dates", url: "https://example.com/dates" },
  dismissible: true,
  startsAt: "2020-01-01T00:00:00Z",
  expiresAt: "2030-01-01T00:00:00Z",
};

function mountBanner() {
  document.body.innerHTML = `
    <aside id="globalAnnouncement" hidden>
      <span id="globalAnnouncementIcon"></span>
      <p id="globalAnnouncementText"></p>
      <a id="globalAnnouncementLink" hidden></a>
      <button id="globalAnnouncementDismiss" type="button" hidden>Dismiss</button>
    </aside>`;
}

describe("announcement banner", () => {
  beforeEach(() => {
    localStorage.clear();
    mountBanner();
    vi.restoreAllMocks();
  });

  it("validates and normalizes supported announcement content", () => {
    expect(parseAnnouncement(validAnnouncement)).toMatchObject({
      id: "registration-reminder",
      type: "warning",
      link: { label: "View dates", url: "https://example.com/dates" },
    });
    expect(parseAnnouncement({ ...validAnnouncement, type: "urgent" })).toBeNull();
    expect(parseAnnouncement({ ...validAnnouncement, link: { label: "Bad", url: "javascript:alert(1)" } })).toBeNull();
    expect(parseAnnouncement({ ...validAnnouncement, startsAt: "not-a-date" })).toBeNull();
  });

  it("uses a static local fixture only for local development", () => {
    expect(announcementConfigUrl("localhost"))
      .toBe("/static/notifications/global-announcement.local.json");
    expect(announcementConfigUrl("127.0.0.1"))
      .toBe("/static/notifications/global-announcement.local.json");
    expect(announcementConfigUrl("www.crimsonscheduler.com"))
      .toContain("ninjao9.github.io/Crimson-Scheduler/api/v1/announcements/global.json");
  });

  it("honors enabled state and inclusive start and exclusive expiration", () => {
    const announcement = parseAnnouncement(validAnnouncement);
    expect(isAnnouncementActive(announcement, Date.parse("2020-01-01T00:00:00Z"))).toBe(true);
    expect(isAnnouncementActive(announcement, Date.parse("2030-01-01T00:00:00Z"))).toBe(false);
    expect(isAnnouncementActive({ ...announcement, enabled: false }, Date.now())).toBe(false);
    expect(isAnnouncementActive({ ...announcement, startsAt: "2027-01-01T00:00:00Z" }, Date.now())).toBe(false);
  });

  it("renders text and links safely and persists dismissal per announcement ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => validAnnouncement });
    vi.stubGlobal("fetch", fetchMock);
    await initializeAnnouncementBanner();

    expect(document.getElementById("globalAnnouncement").hidden).toBe(false);
    expect(document.getElementById("globalAnnouncementText").textContent).toBe("Registration opens soon.");
    expect(document.getElementById("globalAnnouncementLink").href).toBe("https://example.com/dates");
    expect(fetchMock).toHaveBeenCalledWith("/static/notifications/global-announcement.local.json", expect.objectContaining({ cache: "no-cache" }));

    document.getElementById("globalAnnouncementDismiss").click();
    expect(document.getElementById("globalAnnouncement").hidden).toBe(true);
    expect(localStorage.getItem("crimson-announcement-dismissed:registration-reminder")).toBe("true");

    mountBanner();
    await initializeAnnouncementBanner();
    expect(document.getElementById("globalAnnouncement").hidden).toBe(true);

    mountBanner();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...validAnnouncement, id: "new-id" }) }));
    await initializeAnnouncementBanner();
    expect(document.getElementById("globalAnnouncement").hidden).toBe(false);
  });

  it("keeps the banner hidden for disabled, malformed, unavailable, or expired data", async () => {
    const cases = [
      { ok: true, json: async () => ({ ...validAnnouncement, enabled: false }) },
      { ok: true, json: async () => ({ ...validAnnouncement, type: "unknown" }) },
      { ok: false, json: async () => validAnnouncement },
      { ok: true, json: async () => ({ ...validAnnouncement, expiresAt: "2020-01-01T00:00:00Z" }) },
    ];
    for (const response of cases) {
      mountBanner();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await initializeAnnouncementBanner();
      expect(document.getElementById("globalAnnouncement").hidden).toBe(true);
    }

    mountBanner();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(initializeAnnouncementBanner()).resolves.toBeUndefined();
    expect(document.getElementById("globalAnnouncement").hidden).toBe(true);
  });

  it("returns null when fetching fails or JSON cannot be parsed", async () => {
    await expect(fetchAnnouncement(vi.fn().mockRejectedValue(new Error("offline")))).resolves.toBeNull();
    await expect(fetchAnnouncement(vi.fn().mockResolvedValue({ ok: false }))).resolves.toBeNull();
    await expect(fetchAnnouncement(vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("bad json"); } }))).resolves.toBeNull();
  });

  it("still displays and dismisses for the current page when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => validAnnouncement }));
    await initializeAnnouncementBanner();
    expect(document.getElementById("globalAnnouncement").hidden).toBe(false);
    document.getElementById("globalAnnouncementDismiss").click();
    expect(document.getElementById("globalAnnouncement").hidden).toBe(true);
  });
});
