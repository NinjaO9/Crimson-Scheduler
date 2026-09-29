import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeMobileCourseSheet,
  openMobileCourseSheet,
} from "../web/classes/static/js/schedule/calendar.js";
import {
  closeMobileMiscSheet,
  isGoogleOrChromeMobileApp,
  openMobileMiscSheet,
  syncMobileMiscPanel,
} from "../web/classes/static/js/schedule/responsive.js";

const setMobileViewport = (matches) => {
  window.matchMedia = vi.fn(() => ({ matches }));
};

describe("mobile layout sheets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setMobileViewport(true);
    window.requestAnimationFrame = (callback) => callback();
    document.body.className = "";
    document.body.innerHTML = `
      <main class="schedule-pane" data-mobile-pane="schedule">
        <button id="mobileMiscToggle" aria-expanded="false"></button>
        <section class="misc-panel" id="miscPanel"></section>
      </main>
      <div id="mobileMiscSheet" aria-hidden="true" hidden>
        <section class="mobile-misc-panel" tabindex="-1">
          <div id="mobileMiscPanelHost"></div>
        </section>
      </div>
      <div id="mobileCourseSheet" aria-hidden="true" hidden>
        <button data-close-course>Done</button>
        <div id="mobileCourseDetails"></div>
        <button id="mobileCourseRemove">Remove</button>
      </div>
    `;
  });

  it("moves the misc panel into the mobile sheet host", () => {
    syncMobileMiscPanel();
    expect(
      document
        .getElementById("mobileMiscPanelHost")
        .contains(document.getElementById("miscPanel")),
    ).toBe(true);

    setMobileViewport(false);
    syncMobileMiscPanel();
    expect(
      document
        .querySelector(".schedule-pane")
        .contains(document.getElementById("miscPanel")),
    ).toBe(true);
  });

  it("opens and closes the misc sheet with focus restoration", () => {
    const trigger = document.getElementById("mobileMiscToggle");
    openMobileMiscSheet(trigger);
    const sheet = document.getElementById("mobileMiscSheet");
    expect(sheet.getAttribute("aria-hidden")).toBe("false");
    expect(document.body.classList.contains("mobile-misc-sheet-open")).toBe(
      true,
    );
    expect(document.activeElement).toBe(sheet.querySelector(".mobile-misc-panel"));

    sheet.classList.add("is-open");
    closeMobileMiscSheet();
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("opens course details and restores focus on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    openMobileCourseSheet(trigger, {
      course_code: "CPT_S 121",
      course_name: "Program Design",
      section_num: "01",
      days: "MWF",
      time: "9:00 AM - 9:50 AM",
      location: "SLO 101",
      instructor: "Instructor",
      credits: "4",
      section_id: "section-1",
    });
    const sheet = document.getElementById("mobileCourseSheet");
    expect(sheet.getAttribute("aria-hidden")).toBe("false");
    expect(document.getElementById("mobileCourseDetails").textContent).toContain(
      "CPT_S 121",
    );
    expect(document.activeElement).toBe(
      document.getElementById("mobileCourseRemove"),
    );

    sheet.classList.add("is-open");
    closeMobileCourseSheet();
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(trigger);
  });

  it("restricts image export only to Google and Chrome mobile apps", () => {
    expect(
      isGoogleOrChromeMobileApp("Mozilla/5.0 Chrome/140.0 Mobile Safari/537.36"),
    ).toBe(true);
    expect(isGoogleOrChromeMobileApp("Mozilla/5.0 CriOS/140.0 Mobile")).toBe(
      true,
    );
    expect(isGoogleOrChromeMobileApp("Mozilla/5.0 GSA/400.0 Mobile")).toBe(
      true,
    );
    expect(
      isGoogleOrChromeMobileApp("Mozilla/5.0 EdgA/140.0 Chrome/140.0 Mobile"),
    ).toBe(false);
    setMobileViewport(false);
    expect(isGoogleOrChromeMobileApp("Mozilla/5.0 Chrome/140.0 Mobile")).toBe(
      false,
    );
  });
});
