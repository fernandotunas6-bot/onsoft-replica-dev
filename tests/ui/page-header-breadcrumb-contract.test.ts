import { describe, expect, it } from "vitest";
import type { PageCrumb } from "@/components/layout/PageHeader";

function defaultCrumbs(group: string, title: string): PageCrumb[] {
  return [{ label: "Início", to: "/" }, { label: group }, { label: title }];
}

describe("PageHeader breadcrumb contract", () => {
  it("builds Início → grupo → título by default", () => {
    const trail = defaultCrumbs("Académico", "Turmas");
    expect(trail).toEqual([
      { label: "Início", to: "/" },
      { label: "Académico" },
      { label: "Turmas" },
    ]);
    expect(trail[0]?.to).toBe("/");
    expect(trail.at(-1)?.to).toBeUndefined();
  });
});
