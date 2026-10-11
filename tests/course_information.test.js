import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCourseInformationCache,
  courseSpecificsKey,
  courseSpecificsUrl,
  fetchCourseInformation,
  instructorNames,
  normalizeSpecifics,
  renderCourseInformation,
  rmpSearchUrl,
} from "../web/classes/static/js/schedule/course-information.js";

const course = {
  subject: "CPT_S",
  course_number: 121,
  course_code: "CPT_S 121",
  lecture_sections: [
    { instructor: "Ada Lovelace", instructors: [{ name: "Ada Lovelace" }] },
    { instructor: "TBA", instructors: [{ name: "Ada Lovelace" }] },
  ],
  lab_sections: [{ instructor: "Grace Hopper", instructors: [{ fullName: "Grace Hopper" }] }],
};

describe("course information", () => {
  beforeEach(() => {
    clearCourseInformationCache();
    vi.restoreAllMocks();
  });

  it("builds stable keys and specifics URLs", () => {
    expect(courseSpecificsKey(course)).toBe("cpt-s-121");
    expect(courseSpecificsUrl(course, "/api/v1/specifics")).toBe("/api/v1/specifics/cpt-s-121.json");
  });

  it("normalizes the generated nested response", () => {
    expect(normalizeSpecifics({ sources: [{ response: { courseDescription: "<b>303 Architectural Design IV</b> Description", coursePrerequisites: "CPT_S 111" } }] })).toEqual({
      description: "Description",
      prerequisites: "CPT_S 111",
    });
  });

  it("deduplicates instructors and omits unavailable names", () => {
    expect(instructorNames(course)).toEqual(["Ada Lovelace", "Grace Hopper"]);
  });

  it("loads and caches live information", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: true, sources: [{ response: { courseDescription: "Live", coursePrerequisites: "None" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchCourseInformation(course)).resolves.toMatchObject({ status: "loaded", description: "Live" });
    await fetchCourseInformation(course);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses section instructors even when specifics includes instructor data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        sources: [{ response: {
          courseDescription: "Live",
          coursePrerequisites: "None",
          instructors: [{ name: "Endpoint Instructor" }],
        } }],
      }),
    }));
    await expect(fetchCourseInformation(course)).resolves.toMatchObject({
      instructors: ["Ada Lovelace", "Grace Hopper"],
    });
  });

  it("falls back to clearly marked preview information on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchCourseInformation(course)).resolves.toMatchObject({ status: "preview", description: expect.stringContaining("Sample") });
  });

  it("encodes professor names in RMP search links", () => {
    expect(rmpSearchUrl("Ada Lovelace")).toContain("q=Ada%20Lovelace");
  });

  it("renders the shared information sections and safe external links", () => {
    const host = document.createElement("div");
    host.appendChild(renderCourseInformation({
      status: "loaded",
      description: "Live description",
      prerequisites: "None",
      instructors: ["Ada Lovelace"],
    }));
    expect(host.textContent).toContain("Course description");
    expect(host.textContent).toContain("Prerequisites");
    expect(host.querySelector("a").target).toBe("_blank");
    expect(host.querySelector("a").rel).toContain("noopener");
  });
});
