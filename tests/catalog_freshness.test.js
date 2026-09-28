import { describe, expect, it } from "vitest";
import { formatCatalogFreshness } from "../web/classes/static/js/schedule/catalog-freshness.js";

describe("catalog freshness", () => {
  it("describes a recent catalog timestamp in relative time", () => {
    const now = Date.parse("2026-09-28T12:30:00Z");
    expect(formatCatalogFreshness("2026-09-28T11:00:00Z", now).text)
      .toBe("Course catalog updated 1 hour ago");
  });

  it("returns null for a malformed timestamp", () => {
    expect(formatCatalogFreshness("not-a-timestamp")).toBeNull();
  });
});
