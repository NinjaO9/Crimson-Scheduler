import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderCourseResult } from "../web/classes/static/src/schedule/course-search.js";
import { initializeScheduleViewTabs } from "../web/classes/static/src/schedule/schedule-views.js";
import { setMobilePane } from "../web/classes/static/src/schedule/responsive.js";

describe("schedule view tabs", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="schedule-shell" data-active-mobile-pane="search">
        <section class="search-pane is-active" data-mobile-pane="search">
          <input id="searchInput" value="CPT_S 121">
        </section>
        <section class="schedule-pane" data-mobile-pane="schedule">
          <div class="schedule-view-tabs" role="tablist" aria-label="Schedule views">
            <button id="scheduleCreatorTab" role="tab" aria-controls="scheduleCreatorPanel" aria-selected="true">Schedule Creator</button>
            <button id="scheduleGeneratorTab" role="tab" aria-controls="scheduleGeneratorPanel" aria-selected="false">Schedule Generator</button>
          </div>
          <div id="scheduleCreatorPanel" role="tabpanel" aria-labelledby="scheduleCreatorTab">
            <div id="calendarGrid">Saved course</div>
          </div>
          <div id="scheduleGeneratorPanel" role="tabpanel" aria-labelledby="scheduleGeneratorTab" hidden></div>
        </section>
      </div>
      <button class="mobile-nav-btn" data-mobile-nav="search"></button>
      <button class="mobile-nav-btn" data-mobile-nav="schedule"></button>
    `;
  });

  it("starts on Creator and preserves search and calendar content through switches", () => {
    initializeScheduleViewTabs();
    const creatorTab = document.getElementById("scheduleCreatorTab");
    const generatorTab = document.getElementById("scheduleGeneratorTab");
    const creatorPanel = document.getElementById("scheduleCreatorPanel");
    const generatorPanel = document.getElementById("scheduleGeneratorPanel");
    const calendar = document.getElementById("calendarGrid");

    expect(creatorPanel.hidden).toBe(false);
    expect(generatorPanel.hidden).toBe(true);
    expect(creatorTab.getAttribute("aria-selected")).toBe("true");
    expect(creatorTab.tabIndex).toBe(0);

    generatorTab.click();
    expect(creatorPanel.hidden).toBe(true);
    expect(generatorPanel.hidden).toBe(false);
    expect(generatorTab.getAttribute("aria-selected")).toBe("true");
    expect(creatorTab.tabIndex).toBe(-1);
    expect(document.getElementById("searchInput").value).toBe("CPT_S 121");

    creatorTab.click();
    expect(creatorPanel.hidden).toBe(false);
    expect(calendar.textContent).toBe("Saved course");
    expect(creatorPanel.contains(calendar)).toBe(true);
  });

  it("keeps Generator selected while mobile navigation visits Search", () => {
    initializeScheduleViewTabs();
    const generatorTab = document.getElementById("scheduleGeneratorTab");
    generatorTab.click();

    setMobilePane("search");
    setMobilePane("schedule");

    expect(generatorTab.getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("scheduleGeneratorPanel").hidden).toBe(false);
    expect(document.querySelector(".schedule-pane").classList.contains("is-active")).toBe(true);
  });

  it("replaces section disclosure with a placeholder add control in Generator", () => {
    const result = renderCourseResult({
      id: "cpt-s-580",
      subject: "CPT_S",
      course_number: 580,
      course_code: "CPT_S 580",
      course_name: "Advanced Topics in Computer Science",
      credits: "3",
      has_required_lab: false,
      lecture_sections: [],
      lab_sections: [],
      ucore: "",
      term_slug: "fall-2026",
    });
    document.querySelector(".search-pane").appendChild(result);
    initializeScheduleViewTabs();

    const summary = result.querySelector(".result-summary-toggle");
    const addButton = result.querySelector(".generator-course-add");
    const sections = result.querySelector(".collapse");
    sections.classList.add("show");

    document.getElementById("scheduleGeneratorTab").click();
    expect(document.querySelector(".schedule-shell").dataset.activeScheduleView).toBe("generator");
    expect(summary.disabled).toBe(true);
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    expect(sections.classList.contains("show")).toBe(false);
    expect(addButton.textContent).toBe("+");
    expect(addButton.getAttribute("aria-label")).toContain("CPT_S 580");

    addButton.click();
    expect(sections.classList.contains("show")).toBe(false);

    document.getElementById("scheduleCreatorTab").click();
    expect(summary.disabled).toBe(false);
  });

  it("defines the Generator workspace in the intended section order", () => {
    const template = readFileSync(
      "web/classes/templates/classes/schedule_build.html",
      "utf8",
    );
    const actions = template.indexOf("generator-actions");
    const display = template.indexOf("generator-display");
    const schedule = template.indexOf("generator-schedule-section");
    const possibilities = template.indexOf("generator-possibilities");
    const combinationsTrigger = template.indexOf('id="mobileCombinationsToggle"');
    const selectedCoursesTrigger = template.indexOf('id="mobileGeneratorToggle"');
    const selection = template.indexOf("generator-selection");

    expect(template).toContain("Generate Schedules");
    expect(template).toContain("Generator Options");
    expect(template).toContain('id="generatorCalendarHeader"');
    expect(template).toContain('id="generatorCalendarGrid"');
    expect(template).toContain("Generated schedule alternatives will appear here.");
    expect(template).toContain("Selected Courses");
    expect(template).toMatch(/class="app-button app-button--toolbar primary-btn generator-action-btn" id="generateSchedulesBtn" disabled/);
    expect(template).toMatch(/class="app-button manage-btn generator-options-btn" id="generatorOptionsBtn"\s+aria-haspopup="dialog" aria-expanded="false" aria-controls="mobileGeneratorOptionsSheet" disabled/);
    expect(actions).toBeLessThan(display);
    expect(display).toBeLessThan(schedule);
    expect(schedule).toBeLessThan(possibilities);
    expect(possibilities).toBeLessThan(selection);
    expect(possibilities).toBeLessThan(combinationsTrigger);
    expect(combinationsTrigger).toBeLessThan(selectedCoursesTrigger);
    expect(template).toContain('id="mobileCombinationsSheet" aria-hidden="true" hidden inert');
    expect(template).toContain('id="mobileCombinationsPanelHost"');
  });
});
