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

let changeHandler = null;
let selectorButton = null;

/**
 * Takes a name of a schedule, and normalizes it to ensure nothing unexprected happens later
 * 
 * @param {*} value - value to be normalized into a string.
 * @returns {string} - Normalized string of the input value.
 */
function normalizeName(value) {
  return String(value || DEFAULT_SCHEDULE_NAME)
    .trim()
    .slice(0, SCHEDULE_NAME_MAX_LENGTH) || DEFAULT_SCHEDULE_NAME;
}

/**
 * Closes the schedule selector
 * 
 * @returns {void}
 */
function closeSelector() {
  if (!selectorButton) return;
  selectorButton.setAttribute("aria-expanded", "false");
  const menu = document.getElementById("scheduleSelectorMenu");
  if (menu) menu.classList.remove("show");
}

/**
 * Updates the button on the site to reflect the active schedule name.
 * 
 * @returns {void}
 */
function updateButtonLabel() {
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
 * @param {string} action - Key for getting svg. 
 * @param {Object} schedule - Schedule... button that this icon button will be added to .
 * @param {string} label - Aria label for button.
 * @param {string} icon - Fallback icon incase the action does not map to an svg.
 * @returns {HTMLButtonElement} - The button that was created.
 */
function makeIconButton(action, schedule, label, icon) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `schedule-row-action schedule-row-${action}`;
  button.dataset.scheduleAction = action;
  button.dataset.scheduleId = schedule.id;
  button.setAttribute("aria-label", `${label} ${schedule.name}`);
  button.title = label;
  const iconSvg = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.2 2.2 0 0 0-3.1-3.1L4 16.5Z"/><path d="m14.5 5.5 4 4"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  };
  button.innerHTML = iconSvg[action] || `<span aria-hidden="true">${icon}</span>`;
  return button;
}

function beginRename(row, schedule) {
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
  const finish = (save) => {
    if (finished) return;
    finished = true;
    if (save) renameSchedule(schedule.id, normalizeName(input.value));
    renderScheduleSelector();
  };
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
}

/**
 * Renders the schedule selector, using the user's current schedules.
 * 
 * @returns {void}
 */
function renderScheduleSelector() {
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
 * @param {Event} event - Click event from a user pressing a schedule selector action.
 * @returns {void}
 */
async function handleScheduleAction(event) {
  const target = event.target.closest("[data-schedule-action]");
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  const action = target.dataset.scheduleAction;
  const scheduleId = target.dataset.scheduleId;
  const schedule = getSchedules().find((item) => item.id === scheduleId);

  if (action === "edit" && schedule) {
    beginRename(target.closest(".schedule-row"), schedule);
    return;
  }

  if (action === "save" || action === "cancel") {
    const row = target.closest(".schedule-row");
    const input = row && row.querySelector(".schedule-row-input");
    if (input) {
      if (action === "save") renameSchedule(scheduleId, normalizeName(input.value));
      renderScheduleSelector();
    }
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
 * @param {Function} [options.onScheduleChange] - Action to be preformed when the schedule is modified. 
 * @returns {void}
 */
export function initializeScheduleSelector({ onScheduleChange } = {}) {
  selectorButton = document.getElementById("scheduleSelectorButton");
  const menu = document.getElementById("scheduleSelectorMenu");
  if (!selectorButton || !menu) return;

  changeHandler = onScheduleChange;
  renderScheduleSelector();
  document.addEventListener("click", handleScheduleAction);

  selectorButton.addEventListener("click", () => {
    const expanded = selectorButton.getAttribute("aria-expanded") === "true";
    selectorButton.setAttribute("aria-expanded", String(!expanded));
  });
}

/**
 * Wrapper of refreshScheduleSelector to make more syntactic (?) sense when updating the selector.
 * 
 * @returns {void}
 */
export function refreshScheduleSelector() {
  renderScheduleSelector();
}

/**
 * Sets the name of the active schedule.
 * 
 * @param {string} name - Name to change the active schedule to. 
 * 
 * @returns {void}
 */
export function setScheduleSelectorName(name) {
  const active = getActiveSchedule();
  if (active) renameSchedule(active.id, normalizeName(name));
  renderScheduleSelector();
}
