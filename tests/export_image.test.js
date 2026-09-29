import { describe, expect, it } from "vitest";
import {
  getScheduleExportBackgroundColor,
  isMobileBrowser,
} from "../web/classes/static/js/schedule/export-image.js";

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

  it("uses the image preview flow only for mobile browsers", () => {
    expect(
      isMobileBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
    expect(isMobileBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      false,
    );
  });
});
