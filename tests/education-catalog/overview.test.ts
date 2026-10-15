import { describe, expect, it } from "vitest";
import { buildCatalogOverview } from "@/features/education-catalog/overview";

describe("resumo do catálogo para o ADMIN", () => {
  const o = buildCatalogOverview();

  it("totais batem com os dados", () => {
    expect(o.totals.iscedLevels).toBe(9);
    expect(o.totals.stages).toBe(o.stages.length);
    expect(o.totals.sources).toBe(o.sources.length);
    expect(o.totals.countriesWithStages).toBe(o.coverage.filter((c) => c.stages > 0).length);
  });

  it("etapas com estado e fonte legíveis", () => {
    const ep = o.stages.find((s) => s.id === "AO-EP")!;
    expect(ep).toMatchObject({
      country: "AO",
      isced: 1,
      statusLabel: "Em revisão",
      track: "Ensino geral",
    });
    expect(ep.planEntries).toBeGreaterThan(0);
    expect(o.stages.find((s) => s.id === "MZ-EP1")!.planEntries).toBe(0);
  });

  it("só dados de referência: nenhum campo de escola ou pessoa", () => {
    const text = JSON.stringify(o);
    expect(text).not.toMatch(/school_id|student|user_id|email/i);
  });
});
