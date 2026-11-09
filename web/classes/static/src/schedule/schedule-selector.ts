/**
 * @fileoverview Renders and manages the multi-schedule selector.
 * @version      1.0.0
 * @package      CrimsonScheduler
 * @author       NinjaO9
 */

import {
  DEFAULT_SCHEDULE_NAME,
  SCHEDULE_NAME_MAX_LENGTH,
} from "./constants.js";
import {
  createSchedule,
  deleteSchedule,
  getActiveSchedule,
  getSchedules,
  renameSchedule,
  switchSchedule,
} from "./schedule-state.js";
import type { ScheduleRecord } from "../types.js";

type ScheduleChangeHandler = () => void | Promise<void>;
type IconAction = "edit" | "delete" | "save" | "cancel";

let changeHandler: ScheduleChangeHandler | null = null;
let selectorButton: HTMLButtonElement | null = null;

/**
 * Takes a name of a schedule, and normalizes it to ensure nothing unexprected happens later
 * 
 */
function normalizeName(value: unknown): string {
  return String(value || DEFAULT_SCHEDULE_NAME)
    .trim()
    .slice(0, SCHEDULE_NAME_MAX_LENGTH) || DEFAULT_SCHEDULE_NAME;
}

/**
 * Closes the schedule selector
 * 
 */
function closeSelector(): void {
  if (!selectorButton) return;
  selectorButton.setAttribute("aria-expanded", "false");
  const menu = document.getElementById("scheduleSelectorMenu");
  if (menu) menu.classList.remove("show");
}

/**
 * Updates the button on the site to reflect the active schedule name.
 * 
 */
function updateButtonLabel(): void {
  const active = getActiveSchedule();
  const label = document.getElementById("scheduleSelectorLabel");
  if (!label || !active) return;
  label.textContent = active.name;
  label.title = active.name;
  label.setAttribute("aria-label", `Active schedule: ${active.name}`);
}

/**
 * Brief utility (may need to move later) to create a button that is expected to have an icon.
 * 
 */
function makeIconButton(action: IconAction, schedule: ScheduleRecord, label: string, icon: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `schedule-row-action schedule-row-${action}`;
  button.dataset.scheduleAction = action;
  button.dataset.scheduleId = schedule.id;
  button.setAttribute("aria-label", `${label} ${schedule.name}`);
  button.title = label;
  const iconSvg: Record<IconAction, string> = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.2 2.2 0 0 0-3.1-3.1L4 16.5Z"/><path d="m14.5 5.5 4 4"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  };
  button.innerHTML = iconSvg[action] || `<span aria-hidden="true">${icon}</span>`;
  return button;
}

function beginRename(row: HTMLElement, schedule: ScheduleRecord): void {
  if (row.classList.contains("is-editing")) return;
  row.classList.add("is-editing");
  const name = row.querySelector(".schedule-row-name");
  const actions = row.querySelector(".schedule-row-actions");
  if (!name || !actions) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "schedule-row-input";
  input.maxLength = SCHEDULE_NAME_MAX_LENGTH;
  input.value = schedule.name;
  input.setAttribute("aria-label", `Rename ${schedule.name}`);
  name.replaceWith(input);
  const saveButton = makeIconButton("save", schedule, "Save schedule name", "✓");
  const cancelButton = makeIconButton("cancel", schedule, "Cancel rename", "×");
  [saveButton, cancelButton].forEach((button) =>
    button.addEventListener("mousedown", (event) => event.preventDefault()),
  );
  actions.replaceChildren(saveButton, cancelButton);
  input.focus();
  input.select();

  let finished = false;
  const finish = (save: boolean): void => {
    if (finished) return;
    finished = true;
    if (save) renameSchedule(schedule.id, normalizeName(input.value));
    renderScheduleSelector();
  };
  saveButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    finish(true);
  });
  cancelButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (event) => {
    // So Bootstrap dropdowns close out by default when pressing space.
    // If I did preventDefault, then it would prevent the space from being recognized in general.
    // This is a super jank way of doing it, but I can't think of something else right now... soo...
    if (event.code === "Space" || event.key === ' ') {
      event.preventDefault();
      input.value = input.value + ' ';
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  
  const keepDropdownOpen = (event: MouseEvent): void => {
    // Quick fix for preventing dropdown from disappearing when trying to edit names
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  input.addEventListener("mousedown", keepDropdownOpen);
  input.addEventListener("click", keepDropdownOpen);
}

/**
 * Renders the schedule selector, using the user's current schedules.
 * 
 */
function renderScheduleSelector(): void {
  const list = document.getElementById("scheduleSelectorList");
  if (!list) return;

  const active = getActiveSchedule();
  list.replaceChildren();

  // Making a schedule button for every schedule that a user has
  getSchedules().forEach((schedule) => {
    const row = document.createElement("div");
    row.className = "schedule-row";
    row.dataset.scheduleId = schedule.id;
    if (active && active.id === schedule.id) row.classList.add("is-active");

    const select = document.createElement("button");
    select.type = "button";
    select.className = "schedule-row-select";
    select.dataset.scheduleAction = "select";
    select.dataset.scheduleId = schedule.id;
    select.setAttribute("aria-current", active && active.id === schedule.id ? "true" : "false");
    select.title = schedule.name;

    const name = document.createElement("span");
    name.className = "schedule-row-name";
    name.textContent = schedule.name;
    select.appendChild(name);

    const actions = document.createElement("span");
    actions.className = "schedule-row-actions";
    actions.append(
      makeIconButton("edit", schedule, "Rename schedule", "✎"),
      makeIconButton("delete", schedule, "Delete schedule", "×"),
    );

    row.append(select, actions);
    list.appendChild(row);
  });

  // Update the active schedule button.
  updateButtonLabel();
}

/**
 * Handles actions that can be preformed by the selector.
 * 
 */
async function handleScheduleAction(event: MouseEvent): Promise<void> {
  if (!(event.target instanceof Element)) return;
  const target = event.target.closest<HTMLElement>("[data-schedule-action]");
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  const action = target.dataset.scheduleAction;
  const scheduleId = target.dataset.scheduleId;
  const schedule = getSchedules().find((item) => item.id === scheduleId);

  if (action === "edit" && schedule) {
    const row = target.closest<HTMLElement>(".schedule-row");
    if (row) beginRename(row, schedule);
    return;
  }

  if (action === "delete" && schedule) {
    if (getSchedules().length <= 1) return;
    if (!window.confirm(`Delete “${schedule.name}”? This cannot be undone.`)) return;
    if (deleteSchedule(schedule.id)) {
      renderScheduleSelector();
      if (changeHandler) await changeHandler();
    }
    return;
  }

  if (action === "new") {
    const created = createSchedule(DEFAULT_SCHEDULE_NAME);
    if (!created) return;
    switchSchedule(created.id);
    renderScheduleSelector();
    closeSelector();
    if (changeHandler) await changeHandler();
    return;
  }

  if (action === "select" && schedule) {
    if (schedule.id !== getActiveSchedule()?.id) {
      switchSchedule(schedule.id);
      renderScheduleSelector();
      if (changeHandler) await changeHandler();
    }
    closeSelector();
  }
}

/**
 * Prepares the schedule selector for user interaction. Should only run once.
 * 
 */
export function initializeScheduleSelector(
  { onScheduleChange }: { onScheduleChange?: ScheduleChangeHandler } = {},
): void {
  const button = document.querySelector<HTMLButtonElement>("#scheduleSelectorButton");
  const menu = document.getElementById("scheduleSelectorMenu");
  if (!button || !menu) return;

  selectorButton = button;
  changeHandler = onScheduleChange ?? null;
  renderScheduleSelector();
  document.addEventListener("click", handleScheduleAction);

  selectorButton.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
  });
}

/**
 * Wrapper of refreshScheduleSelector to make more syntactic (?) sense when updating the selector.
 * 
 */
export function refreshScheduleSelector(): void {
  renderScheduleSelector();
}

/**
 * Sets the name of the active schedule.
 * 
 */
export function setScheduleSelectorName(name: string): void {
  const active = getActiveSchedule();
  if (active) renameSchedule(active.id, normalizeName(name));
  renderScheduleSelector();
}
