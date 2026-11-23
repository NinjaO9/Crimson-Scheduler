import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeGeneratorOptions } from "../web/classes/static/src/schedule/generator-options.js";

let mobile = true;

describe("generator options", () => {
  beforeEach(() => {
    localStorage.clear();
    mobile = true;
    window.matchMedia = vi.fn(() => ({ matches: mobile }));
    window.requestAnimationFrame = (callback) => callback();
    document.body.className = "";
    document.body.innerHTML = `
      <button id="generatorOptionsBtn" aria-expanded="false" disabled>Generator Options</button>
      <div id="mobileGeneratorOptionsSheet" hidden inert aria-hidden="true">
        <button data-close-generator-options>Close</button>
        <section class="mobile-generator-options-panel" tabindex="-1">
          <button data-generator-count-step="-1">Fewer</button>
          <output id="generatorScheduleCount">3</output>
          <button data-generator-count-step="1">More</button>
          <button data-close-generator-options>Done</button>
        </section>
      </div>
    `;
  });

  it("opens the mobile sheet, saves the count, and restores focus on close", () => {
    const options = initializeGeneratorOptions();
    const button = document.getElementById("generatorOptionsBtn");
    const sheet = document.getElementById("mobileGeneratorOptionsSheet");
    const output = document.getElementById("generatorScheduleCount");
    const decrease = sheet.querySelector('[data-generator-count-step="-1"]');
    const increase = sheet.querySelector('[data-generator-count-step="1"]');

    expect(button.disabled).toBe(false);
    expect(options.getCount()).toBe(3);
    expect(output.textContent).toBe("3");
    button.click();
    expect(sheet.hidden).toBe(false);
    expect(sheet.inert).toBe(false);
    expect(sheet.getAttribute("aria-hidden")).toBe("false");
    expect(document.activeElement).toBe(sheet.querySelector(".mobile-generator-options-panel"));

    for (let index = 0; index < 7; index++) increase.click();
    expect(options.getCount()).toBe(10);
    expect(output.textContent).toBe("10");
    expect(increase.disabled).toBe(true);
    expect(localStorage.getItem("crimson_scheduler_generator_count")).toBe("10");
    for (let index = 0; index < 9; index++) decrease.click();
    expect(options.getCount()).toBe(1);
    expect(decrease.disabled).toBe(true);
    expect(localStorage.getItem("crimson_scheduler_generator_count")).toBe("1");
    sheet.querySelector("[data-close-generator-options]").click();
    expect(sheet.inert).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("uses the saved count and disables the sheet trigger on desktop", () => {
    localStorage.setItem("crimson_scheduler_generator_count", "7");
    const options = initializeGeneratorOptions();
    const button = document.getElementById("generatorOptionsBtn");
    expect(options.getCount()).toBe(7);
    expect(document.getElementById("generatorScheduleCount").textContent).toBe("7");

    button.click();
    mobile = false;
    window.dispatchEvent(new Event("resize"));
    expect(button.disabled).toBe(true);
    expect(document.getElementById("mobileGeneratorOptionsSheet").getAttribute("aria-hidden")).toBe("true");
  });
});
