import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

describe("global term ↔ notas sync", () => {
  it("AssessmentCenter reads and writes selectedTerm via useSchoolSettings", () => {
    const source = readFileSync(
      resolve(root, "src/features/academic/AssessmentCenter.tsx"),
      "utf8",
    );
    expect(source).toContain('from "@/features/auth/use-school-settings"');
    expect(source).toContain("selectedTerm: globalTerm");
    expect(source).toContain("setSelectedTermId");
    expect(source).toContain('setFilter("trimestre", String(sequence))');
    expect(source).toContain("item.sequence === next");
  });

  it("GradePautaSheet bidirectionally syncs term with the topbar period", () => {
    const source = readFileSync(resolve(root, "src/features/academic/GradePautaSheet.tsx"), "utf8");
    expect(source).toContain('from "@/features/auth/use-school-settings"');
    expect(source).toContain("applyTermSelection");
    expect(source).toContain("globalTerm?.sequence");
    expect(source).toContain("setSelectedTermId(match.id)");
  });

  it("PautasWorkspaceModule already mirrors the same contract", () => {
    const source = readFileSync(
      resolve(root, "src/features/pedagogica/components/pautas/PautasWorkspaceModule.tsx"),
      "utf8",
    );
    expect(source).toContain("applyTermSelection");
    expect(source).toContain("selectedTerm: globalTerm");
  });
});
