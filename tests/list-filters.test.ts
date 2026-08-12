import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  dateInRange,
  hasActiveFilters,
  mergeFilterSources,
  parseFilterBag,
  serializeFilterBag,
} from "@/lib/list-filters";

const defaults = { q: "", estado: "todos", turma: "todas" };

describe("parseFilterBag / serializeFilterBag", () => {
  it("round-trips active criteria and skips defaults", () => {
    const raw = serializeFilterBag({ q: "ana", estado: "active", turma: "todas" }, defaults);
    expect(raw).toContain("q=ana");
    expect(raw).toContain("estado=active");
    expect(raw).not.toContain("turma=");
    expect(parseFilterBag(raw)).toEqual({ q: "ana", estado: "active" });
  });

  it("returns an empty bag for blank input", () => {
    expect(parseFilterBag(null)).toEqual({});
    expect(parseFilterBag("")).toEqual({});
  });
});

describe("mergeFilterSources", () => {
  it("prefers URL values when the lf param is present", () => {
    expect(mergeFilterSources(defaults, { q: "stored", estado: "inactive" }, { q: "url" })).toEqual(
      { q: "url", estado: "todos", turma: "todas" },
    );
  });

  it("falls back to localStorage when the URL has no lf param", () => {
    expect(mergeFilterSources(defaults, { q: "stored", estado: "inactive" }, null)).toEqual({
      q: "stored",
      estado: "inactive",
      turma: "todas",
    });
  });

  it("ignores unknown keys from storage or URL", () => {
    expect(mergeFilterSources(defaults, { other: "x", q: "ok" }, null)).toEqual({
      q: "ok",
      estado: "todos",
      turma: "todas",
    });
  });
});

describe("countActiveFilters", () => {
  it("counts only values that differ from defaults", () => {
    expect(countActiveFilters({ ...defaults, q: "ana" }, defaults)).toBe(1);
    expect(hasActiveFilters(defaults, defaults)).toBe(false);
  });
});

describe("dateInRange", () => {
  it("accepts dates inside the inclusive range", () => {
    expect(dateInRange("2026-03-15", "2026-03-01", "2026-03-31")).toBe(true);
    expect(dateInRange("2026-02-28", "2026-03-01", "")).toBe(false);
    expect(dateInRange("2026-04-01", "", "2026-03-31")).toBe(false);
    expect(dateInRange("2026-03-15T12:00:00Z", "", "")).toBe(true);
  });
});
