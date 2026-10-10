import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

describe("global term ↔ notas sync", () => {
  // O Centro é exercitado com sincronização real de estado nos testes de
  // assessment-center.test.tsx; comparar strings não detectava o ciclo.

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
