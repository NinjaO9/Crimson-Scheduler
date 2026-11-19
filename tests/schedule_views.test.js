import { beforeEach, describe, expect, it } from "vitest";
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
});
