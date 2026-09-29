import { describe, expect, it } from "vitest";
import { getScheduleExportBackgroundColor } from "../web/classes/static/js/schedule/export-image.js";

describe("schedule image export", () => {
  it("uses the schedule pane's active theme background", () => {
    const schedulePane = document.createElement("section");
    schedulePane.style.backgroundColor = "rgb(34, 38, 44)";
    document.body.appendChild(schedulePane);

    expect(getScheduleExportBackgroundColor(schedulePane)).toBe(
      "rgb(34, 38, 44)",
    );

    schedulePane.remove();
  });
});
