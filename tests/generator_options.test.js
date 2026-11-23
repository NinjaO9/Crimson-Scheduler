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
      <button id="generatorOptionsBtn" aria-expanded="false" aria-controls="mobileGeneratorOptionsSheet" disabled>Generator Options</button>
      <div id="mobileGeneratorOptionsSheet" hidden inert aria-hidden="true">
        <button data-close-generator-options>Close</button>
        <section class="mobile-generator-options-panel" tabindex="-1">
          <button data-close-generator-options>Done</button>
          <div id="mobileGeneratorOptionsHost">
            <div class="generator-options-field">
              <button data-generator-count-step="-1">Fewer</button>
              <output id="generatorScheduleCount">3</output>
              <button data-generator-count-step="1">More</button>
            </div>
          </div>
        </section>
      </div>
      <div id="desktopGeneratorOptionsPopover" hidden inert aria-hidden="true" tabindex="-1">
        <div id="desktopGeneratorOptionsHost"></div>
      </div>
      <button id="outside">Outside</button>
    `;
  });

  it("keeps the mobile sheet and enforces the saved 1–10 range", () => {
    const options = initializeGeneratorOptions();
    const button = document.getElementById("generatorOptionsBtn");
    const sheet = document.getElementById("mobileGeneratorOptionsSheet");
    const field = document.querySelector(".generator-options-field");
    const output = document.getElementById("generatorScheduleCount");
    const decrease = field.querySelector('[data-generator-count-step="-1"]');
    const increase = field.querySelector('[data-generator-count-step="1"]');

    expect(button.disabled).toBe(false);
    expect(options.getCount()).toBe(3);
    expect(document.getElementById("mobileGeneratorOptionsHost").contains(field)).toBe(true);
    button.click();
    expect(sheet.hidden).toBe(false);
    expect(sheet.inert).toBe(false);
    expect(sheet.getAttribute("aria-hidden")).toBe("false");
    expect(document.activeElement).toBe(sheet.querySelector(".mobile-generator-options-panel"));

    for (let index = 0; index < 7; index++) increase.click();
    expect(options.getCount()).toBe(10);
    expect(output.textContent).toBe("10");
    expect(increase.disabled).toBe(true);
    for (let index = 0; index < 9; index++) decrease.click();
    expect(options.getCount()).toBe(1);
    expect(decrease.disabled).toBe(true);
    expect(localStorage.getItem("crimson_scheduler_generator_count")).toBe("1");

    sheet.querySelector("[data-close-generator-options]").click();
    expect(sheet.inert).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("opens a desktop popover without shifting content and closes on outside click or Escape", () => {
    mobile = false;
    const options = initializeGeneratorOptions();
    const button = document.getElementById("generatorOptionsBtn");
    const popover = document.getElementById("desktopGeneratorOptionsPopover");
    const field = document.querySelector(".generator-options-field");
    const increase = field.querySelector('[data-generator-count-step="1"]');
    button.getBoundingClientRect = () => ({ top: 100, bottom: 144, left: 180, right: 340 });
    popover.getBoundingClientRect = () => ({ width: 280, height: 120 });

    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-controls")).toBe("desktopGeneratorOptionsPopover");
    expect(document.getElementById("desktopGeneratorOptionsHost").contains(field)).toBe(true);
    button.click();
    expect(popover.hidden).toBe(false);
    expect(popover.getAttribute("aria-hidden")).toBe("false");
    expect(popover.style.left).toBe("60px");
    expect(popover.style.top).toBe("152px");
    expect(document.activeElement).toBe(field.querySelector('[data-generator-count-step="-1"]'));
    increase.click();
    expect(options.getCount()).toBe(4);
    expect(popover.hidden).toBe(false);

    document.getElementById("outside").click();
    expect(popover.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popover.hidden).toBe(true);
    expect(document.activeElement).toBe(button);

    button.click();
    button.click();
    expect(popover.hidden).toBe(true);
  });

  it("keeps the desktop popover inside a short viewport", () => {
    mobile = false;
    initializeGeneratorOptions();
    const button = document.getElementById("generatorOptionsBtn");
    const popover = document.getElementById("desktopGeneratorOptionsPopover");
    button.getBoundingClientRect = () => ({ top: 700, bottom: 744, left: 850, right: 1000 });
    popover.getBoundingClientRect = () => ({ width: 280, height: 120 });
    button.click();
    expect(popover.style.left).toBe("720px");
    expect(popover.style.top).toBe("572px");
  });

  it("moves the same saved control between mobile and desktop on resize", () => {
    localStorage.setItem("crimson_scheduler_generator_count", "7");
    const options = initializeGeneratorOptions();
    const button = document.getElementById("generatorOptionsBtn");
    const field = document.querySelector(".generator-options-field");
    expect(options.getCount()).toBe(7);
    expect(document.getElementById("generatorScheduleCount").textContent).toBe("7");

    button.click();
    mobile = false;
    window.dispatchEvent(new Event("resize"));
    expect(document.getElementById("mobileGeneratorOptionsSheet").getAttribute("aria-hidden")).toBe("true");
    expect(document.getElementById("desktopGeneratorOptionsHost").contains(field)).toBe(true);
    expect(button.getAttribute("aria-controls")).toBe("desktopGeneratorOptionsPopover");
    expect(button.disabled).toBe(false);

    button.click();
    expect(document.getElementById("desktopGeneratorOptionsPopover").hidden).toBe(false);
    mobile = true;
    window.dispatchEvent(new Event("resize"));
    expect(document.getElementById("desktopGeneratorOptionsPopover").hidden).toBe(true);
    expect(document.getElementById("mobileGeneratorOptionsHost").contains(field)).toBe(true);
    expect(button.getAttribute("aria-controls")).toBe("mobileGeneratorOptionsSheet");
    expect(options.getCount()).toBe(7);
  });
});
