import { describe, expect, it } from "vitest";
import { summarizePlan } from "@/features/academic/curriculum-templates";
import { applyCatalogStructureInputSchema } from "@/features/academic/curriculum-templates-server";
import {
  plannableStages,
  planFromCatalog,
  stagesWithoutPlan,
} from "@/features/education-catalog/plan-from-catalog";

const base = {
  groupsPerGrade: 1,
  shifts: ["morning" as const],
  capacity: 30,
  createRooms: true,
};

describe("estrutura da escola a partir do catálogo", () => {
  it("Portugal, 1.º ciclo: 1.º a 4.º ano, Português, Inglês só a partir do 3.º", () => {
    const plan = planFromCatalog({ ...base, country: "PT", stages: { "PT-EB1": [] } });
    expect(plan.grades.map((g) => g.name)).toEqual(["1.º ano", "2.º ano", "3.º ano", "4.º ano"]);
    expect(plan.subjects.find((s) => s.code === "LP")?.name).toBe("Português");
    const byGrade = Object.fromEntries(plan.curriculum.map((c) => [c.gradeCode, c.subjectCodes]));
    expect(byGrade["1ANO"]).not.toContain("ING");
    expect(byGrade["3ANO"]).toContain("ING");
    // Opções (EMRC) não entram: escolhe a escola.
    expect(plan.subjects.map((s) => s.code)).not.toContain("EMRC");
    expect(plan.classGroups[0]).toMatchObject({ code: "1A-M", name: "1.º A — Manhã" });
  });

  it("Portugal, secundário: só os cursos escolhidos, com o curso no nome", () => {
    const plan = planFromCatalog({ ...base, country: "PT", stages: { "PT-SEC": ["SEC-CT"] } });
    expect(plan.programs).toEqual([
      expect.objectContaining({
        code: "PT-SEC-CT",
        name: "Ciências e Tecnologias",
        kind: "general",
      }),
    ]);
    expect(plan.grades.map((g) => g.name)).toEqual([
      "10.º ano · CT",
      "11.º ano · CT",
      "12.º ano · CT",
    ]);
    expect(plan.classGroups.map((g) => g.code)).toEqual(["CT10A-M", "CT11A-M", "CT12A-M"]);
    // Etapa com cursos mas nenhum escolhido: nada.
    expect(
      summarizePlan(planFromCatalog({ ...base, country: "PT", stages: { "PT-SEC": [] } })).cursos,
    ).toBe(0);
  });

  it("Moçambique: classes e turmas sem disciplinas, e diz quais ficam sem plano", () => {
    const selection = { ...base, country: "MZ", stages: { "MZ-EP1": [], "MZ-ESG2": [] } };
    const plan = planFromCatalog(selection);
    expect(plan.grades.map((g) => g.name)).toEqual([
      "1ª Classe",
      "2ª Classe",
      "3ª Classe",
      "10ª Classe",
      "11ª Classe",
      "12ª Classe",
    ]);
    expect(plan.subjects).toEqual([]);
    expect(stagesWithoutPlan(selection).map((s) => s.id)).toEqual(["MZ-EP1", "MZ-ESG2"]);
  });

  it("ignora etapas de outro país e etapas sem classes", () => {
    expect(plannableStages("PT").map((s) => s.id)).not.toContain("PT-PRE");
    const plan = planFromCatalog({ ...base, country: "PT", stages: { "AO-EP": [], "PT-PRE": [] } });
    expect(plan.programs).toEqual([]);
  });

  it("tudo escolhido: códigos válidos e sem repetir, em cada país", () => {
    for (const country of ["PT", "MZ", "AO"]) {
      const stages = Object.fromEntries(plannableStages(country).map((s) => [s.id, s.courses]));
      const plan = planFromCatalog({
        ...base,
        groupsPerGrade: 3,
        shifts: ["morning", "afternoon", "evening"],
        country,
        stages,
      });
      const codes = (xs: Array<{ code: string }>) => xs.map((x) => x.code);
      for (const list of [
        plan.levels,
        plan.programs,
        plan.classGroups,
        plan.rooms,
        plan.subjects,
      ]) {
        for (const c of codes(list)) expect(c, `${country}: ${c}`).toMatch(/^[A-Z0-9_-]{2,30}$/);
        expect(new Set(codes(list)).size, country).toBe(list.length);
      }
      for (const c of plan.curriculum) {
        for (const s of c.subjectCodes) expect(codes(plan.subjects), s).toContain(s);
      }
    }
  });
});

describe("validação do pedido no servidor", () => {
  const ok = { country: "pt", stages: { "PT-SEC": ["SEC-CT"] } };
  it("aceita etapas e cursos do país", () => {
    expect(applyCatalogStructureInputSchema.parse(ok)).toMatchObject({
      country: "PT",
      groupsPerGrade: 1,
    });
  });
  it("recusa etapa de outro país ou curso que a etapa não tem", () => {
    expect(() =>
      applyCatalogStructureInputSchema.parse({ country: "PT", stages: { "AO-EP": [] } }),
    ).toThrow(/Etapa desconhecida/);
    expect(() =>
      applyCatalogStructureInputSchema.parse({ country: "PT", stages: { "PT-SEC": ["LIC-DIR"] } }),
    ).toThrow(/não existe/);
  });
});
