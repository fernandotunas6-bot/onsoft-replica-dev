import { describe, expect, it } from "vitest";
import { NAV_DEPTH_CLASS, NAV_ROW_ACTIVE, NAV_SUB_LIST } from "@/components/layout/NavItem";

describe("sidebar nav visual spec", () => {
  it("keeps root items on the type scale (with px minimums), not absolute px", () => {
    expect(NAV_DEPTH_CLASS.root).toContain("text-sm");
    expect(NAV_DEPTH_CLASS.root).not.toContain("text-[12px]");
  });

  it("makes sub-items compact and one step smaller than the root row, never below 11px", () => {
    expect(NAV_DEPTH_CLASS.sub).toContain("h-8");
    // text-xs = max(11px, 0.75rem); 0.6875rem dava 7,5px com a raiz a 11px.
    expect(NAV_DEPTH_CLASS.sub).toContain("text-xs");
    expect(NAV_DEPTH_CLASS.sub).not.toContain("text-[0.6875rem]");
    expect(NAV_DEPTH_CLASS.sub).not.toContain("text-[12px]");
    expect(NAV_DEPTH_CLASS.sub).toContain("gap-2");
  });

  it("applies the unused active-nav shadow token", () => {
    expect(NAV_ROW_ACTIVE).toContain("shadow-nav-active");
  });

  it("nests children with the left rail spec without extra padding that inflates width", () => {
    expect(NAV_SUB_LIST).toContain("nav-sub-list");
    expect(NAV_SUB_LIST).not.toContain("pl-4");
  });
});
