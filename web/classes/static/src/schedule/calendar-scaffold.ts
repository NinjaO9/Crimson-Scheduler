import { DAYS_OF_WEEK, END_HOUR, HOUR_ROW_HEIGHT, START_HOUR } from "./constants.js";
import { createElementWithText } from "./dom.js";
import { hidesWeekends, uses24HourTime } from "./preferences.js";
import { isMobileViewport } from "./responsive.js";
import { formatHourLabel } from "./time-and-meetings.js";

/** 
 * Builds a calendar's axis and cells in the supplied targets. 
 */
export function renderCalendarScaffold(header: HTMLElement, grid: HTMLElement, cellId: (dayIndex: number, hour: number) => string): void {
  const mobile = isMobileViewport();
  const days = mobile || hidesWeekends()
    ? DAYS_OF_WEEK.filter((day) => day.key !== "S" && day.key !== "U")
    : DAYS_OF_WEEK;
  const columns = `${mobile ? "56px" : "82px"} repeat(${days.length}, ${mobile ? "minmax(64px, 1fr)" : "minmax(96px, 1fr)"})`;
  header.style.gridTemplateColumns = columns;
  grid.style.gridTemplateColumns = columns;
  grid.style.gridTemplateRows = `repeat(${END_HOUR - START_HOUR}, ${HOUR_ROW_HEIGHT}px)`;
  header.replaceChildren(createElementWithText("div", "calendar-header-time", "Time"));
  for (const day of days)
    header.appendChild(createElementWithText("div", "calendar-header-day", mobile ? day.label.slice(0, 3) : day.label));
  grid.replaceChildren();
  for (let hour = START_HOUR; hour < END_HOUR; hour++) {
    grid.appendChild(createElementWithText(
      "div", "calendar-time-slot",
      uses24HourTime() ? `${String(hour).padStart(2, "0")}:00` : formatHourLabel(hour),
    ));
    for (const day of days) {
      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      cell.id = cellId(DAYS_OF_WEEK.indexOf(day), hour);
      grid.appendChild(cell);
    }
  }
}
