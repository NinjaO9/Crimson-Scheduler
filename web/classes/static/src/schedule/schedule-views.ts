/**
 * @fileoverview Initializes the schedule view tabs.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

/**
 * Prepares the schedule view's tabs.
 *
 */
export function initializeScheduleViewTabs(): void {
  const tabList = document.querySelector<HTMLElement>(".schedule-view-tabs");
  if (!tabList) return;

  const tabs = Array.from(tabList.querySelectorAll<HTMLButtonElement>("[role='tab']"));

  /**
   * Updates course-result controls to match the selected schedule view.
   * Generator mode replaces section disclosure with the placeholder add button.
   *
   * @param isGenerator - Whether Schedule Generator is the active view.
   */
  const syncCourseResultView = (isGenerator: boolean): void => {
    const shell = tabList.closest<HTMLElement>(".schedule-shell");
    if (shell)
      shell.dataset.activeScheduleView = isGenerator ? "generator" : "creator";

    document.querySelectorAll<HTMLButtonElement>(".result-summary-toggle").forEach((toggle) => {
      toggle.disabled = isGenerator;
      if (isGenerator) {
        toggle.setAttribute("aria-expanded", "false");
        const target = toggle.getAttribute("data-bs-target");
        if (target) document.querySelector(target)?.classList.remove("show");
      }
    });
  };

  /**
   * Displays the panel controlled by the selected tab.
   *
   * @param selectedTab - Tab whose panel should be shown.
   * @param focus - Whether to move keyboard focus to the selected tab.
   */
  const activate = (selectedTab: HTMLButtonElement, focus = false): void => {
    const isGenerator = selectedTab.id === "scheduleGeneratorTab";
    for (const tab of tabs) {
      const selected = tab === selectedTab;
      const panel = document.getElementById(tab.getAttribute("aria-controls") || "");
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (panel) panel.hidden = !selected;
    }
    syncCourseResultView(isGenerator);
    if (focus) selectedTab.focus();
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab));
  }

  activate(tabs[0]);
}
