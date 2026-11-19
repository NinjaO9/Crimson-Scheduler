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
  const activate = (selectedTab: HTMLButtonElement, focus = false): void => {
    for (const tab of tabs) {
      const selected = tab === selectedTab;
      const panel = document.getElementById(tab.getAttribute("aria-controls") || "");
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (panel) panel.hidden = !selected;
    }
    if (focus) selectedTab.focus();
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab));
  }

  activate(tabs[0]);
}
