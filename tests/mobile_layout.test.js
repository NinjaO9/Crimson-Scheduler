/**
 * @fileoverview Test cases for the mobile layout. Ensures that the mobile layout behaves properly and no unexpected behavior happens.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeMobileCourseSheet,
  openMobileCourseSheet,
} from "../web/classes/static/src/schedule/calendar.js";
import { initializeScheduleGeneratorController } from "../web/classes/static/src/schedule/generator-results.js";
import {
  closeMobileCombinationsSheet,
  closeMobileGeneratorSelection,
  closeMobileMiscSheet,
  isGoogleOrChromeMobileApp,
  openMobileCombinationsSheet,
  openMobileGeneratorSelection,
  openMobileMiscSheet,
  syncMobileCombinations,
  syncMobileGeneratorSelection,
  syncMobileMiscPanel,
} from "../web/classes/static/src/schedule/responsive.js";

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
      <input id="timeFormatToggle" type="checkbox">
      <input id="hideWeekendsToggle" type="checkbox" checked>
      <main class="schedule-pane" data-mobile-pane="schedule">
        <button id="mobileMiscToggle" aria-expanded="false"></button>
        <div id="scheduleCreatorPanel">
          <section class="misc-panel" id="miscPanel"></section>
        </div>
        <div id="scheduleGeneratorPanel" tabindex="0">
          <div class="generator-workarea">
            <div class="generator-display">
              <div class="generator-calendar-wrap"><div id="generatorCalendarHeader"></div><div id="generatorCalendarGrid"></div></div>
              <section class="generator-possibilities" id="generatorPossibilities">
                <p id="generatorResultsEmpty">Generated schedule alternatives will appear here.</p>
                <div id="generatorPreviewList"></div>
              </section>
            </div>
            <button id="mobileCombinationsToggle" aria-expanded="false">Combinations <span id="mobileCombinationsCount">(0)</span></button>
            <button id="mobileGeneratorToggle" aria-expanded="false"></button>
            <section class="generator-selection" id="generatorSelection"></section>
          </div>
        </div>
      </main>
      <div id="mobileMiscSheet" aria-hidden="true" hidden>
        <section class="mobile-misc-panel" tabindex="-1">
          <div id="mobileMiscPanelHost"></div>
        </section>
      </div>
      <div id="mobileGeneratorSheet" aria-hidden="true" hidden>
        <section class="mobile-generator-panel" tabindex="-1">
          <div id="mobileGeneratorPanelHost"></div>
        </section>
      </div>
      <div id="mobileCombinationsSheet" aria-hidden="true" hidden inert>
        <button data-close-combinations>Close</button>
        <section class="mobile-combinations-panel" tabindex="-1">
          <div id="mobileCombinationsPanelHost"></div>
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
        .getElementById("scheduleCreatorPanel")
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

  it("moves, opens, and closes the generator selection sheet", () => {
    const trigger = document.getElementById("mobileGeneratorToggle");
    syncMobileGeneratorSelection();
    expect(
      document
        .getElementById("mobileGeneratorPanelHost")
        .contains(document.getElementById("generatorSelection")),
    ).toBe(true);

    openMobileGeneratorSelection(trigger);
    const sheet = document.getElementById("mobileGeneratorSheet");
    expect(sheet.getAttribute("aria-hidden")).toBe("false");
    expect(document.body.classList.contains("mobile-generator-sheet-open")).toBe(true);
    expect(document.activeElement).toBe(sheet.querySelector(".mobile-generator-panel"));

    closeMobileGeneratorSelection();
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);

    setMobileViewport(false);
    syncMobileGeneratorSelection();
    expect(
      document
        .getElementById("scheduleGeneratorPanel")
        .querySelector(".generator-workarea")
        .contains(document.getElementById("generatorSelection")),
    ).toBe(true);
  });

  it("moves the live combinations and opens the empty-state sheet with focus restoration", () => {
    const combinations = document.getElementById("generatorPossibilities");
    const host = document.getElementById("mobileCombinationsPanelHost");
    const trigger = document.getElementById("mobileCombinationsToggle");
    const sheet = document.getElementById("mobileCombinationsSheet");

    syncMobileCombinations();
    expect(host.contains(combinations)).toBe(true);
    openMobileCombinationsSheet(trigger);
    expect(sheet.hidden).toBe(false);
    expect(sheet.inert).toBe(false);
    expect(sheet.getAttribute("aria-hidden")).toBe("false");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.classList.contains("mobile-combinations-sheet-open")).toBe(true);
    expect(document.activeElement).toBe(sheet.querySelector(".mobile-combinations-panel"));
    expect(host.textContent).toContain("Generated schedule alternatives will appear here.");

    closeMobileCombinationsSheet();
    expect(sheet.inert).toBe(true);
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    vi.advanceTimersByTime(180);
    expect(sheet.hidden).toBe(true);
  });

  it("returns combinations to the desktop rail when resized with the sheet open", () => {
    const combinations = document.getElementById("generatorPossibilities");
    const sheet = document.getElementById("mobileCombinationsSheet");
    syncMobileCombinations();
    openMobileCombinationsSheet();

    setMobileViewport(false);
    syncMobileCombinations();
    expect(document.querySelector(".generator-display").contains(combinations)).toBe(true);
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.classList.contains("mobile-combinations-sheet-open")).toBe(false);
    expect(document.activeElement).toBe(document.getElementById("scheduleGeneratorPanel"));
  });

  it("selects a sheet preview, updates the calendar, and returns focus to the trigger", () => {
    syncMobileCombinations();
    const controller = initializeScheduleGeneratorController({
      onResultSelected: () => closeMobileCombinationsSheet(),
    });
    controller.setResults([
      { id: "first", sections: [{ course_code: "CPT_S 121", meetings: [{ days: "M", time: "9:00 AM - 9:50 AM" }] }] },
      { id: "second", sections: [{ course_code: "MATH 171", meetings: [{ days: "T", time: "10:00 AM - 10:50 AM" }] }] },
    ]);
    expect(document.getElementById("mobileCombinationsCount").textContent).toBe("(2)");
    openMobileCombinationsSheet();
    document.querySelectorAll(".generator-preview")[1].click();

    expect(document.getElementById("generatorCalendarGrid").textContent).toContain("MATH 171");
    expect(document.querySelectorAll(".generator-preview")[1].getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("mobileCombinationsSheet").getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(document.getElementById("mobileCombinationsToggle"));
  });

  it("opens course details and restores focus on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    openMobileCourseSheet(trigger, {
      course_code: "CPT_S 121",
      course_name: "Program Design",
      section_num: "01",
      meetings: [{ days: "MWF", time: "9:00 AM - 9:50 AM" }],
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
    expect(document.getElementById("mobileCourseDetails").textContent).toContain(
      "MWF | 9:00 AM - 9:50 AM",
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
