import { describe, expect, it } from "vitest";
import { planSchoolStructure } from "@/features/academic/school-structure-plan";
import { inferTeachingCycle } from "@/lib/angola-academic";

describe("estrutura académica pelo contexto da escola", () => {
  it("escola primária: 1ª a 6ª classe, sem 10ª nem disciplinas do II Ciclo", () => {
    const plan = planSchoolStructure(["primario"]);
    expect(plan.levels.map((l) => l.code)).toEqual(["primary"]);
    expect(plan.grades.map((g) => g.name)).toEqual([
      "1ª Classe",
      "2ª Classe",
      "3ª Classe",
      "4ª Classe",
      "5ª Classe",
      "6ª Classe",
    ]);
    const subjects = plan.subjects.map((s) => s.code);
    expect(subjects).toContain("CN");
    expect(subjects).not.toContain("FIS");
  });

  it("complexo escolar: Iniciação ao II Ciclo, por ordem", () => {
    const plan = planSchoolStructure(["ii_ciclo", "pre_escolar", "i_ciclo", "primario"], ["cfb"]);
    expect(plan.levels.map((l) => l.code)).toEqual([
      "pre_school",
      "primary",
      "cycle_i",
      "cycle_ii",
    ]);
    expect(plan.grades[0]?.name).toBe("Iniciação");
    expect(plan.grades.filter((g) => g.programCode === "ICICLO").map((g) => g.sequence)).toEqual([
      7, 8, 9,
    ]);
  });

  it("II Ciclo com cursos: classes por curso, técnico até à 13ª", () => {
    const plan = planSchoolStructure(["ii_ciclo"], ["cfb", "tecnico"]);
    expect(plan.programs.map((p) => [p.code, p.kind])).toEqual([
      ["IICICLO-CFB", "general"],
      ["IICICLO-TÉCNICO", "technical"],
    ]);
    expect(plan.grades.filter((g) => g.programCode === "IICICLO-CFB")).toHaveLength(3);
    expect(plan.grades.filter((g) => g.programCode === "IICICLO-TÉCNICO")).toHaveLength(4);
    expect(plan.grades.map((g) => g.name)).toContain("13ª Classe · Técnico");
  });

  it("II Ciclo sem cursos indicados: um II Ciclo geral", () => {
    const plan = planSchoolStructure(["ii_ciclo"]);
    expect(plan.programs.map((p) => p.name)).toEqual(["Ensino Geral"]);
    expect(plan.grades.map((g) => g.sequence)).toEqual([10, 11, 12]);
  });

  it("ensino superior: anos de licenciatura, sem tronco comum", () => {
    const plan = planSchoolStructure(["superior"]);
    expect(plan.programs[0]).toMatchObject({ code: "LIC", kind: "undergraduate" });
    expect(plan.grades.map((g) => g.name)).toEqual([
      "1º Ano · LIC",
      "2º Ano · LIC",
      "3º Ano · LIC",
      "4º Ano · LIC",
      "5º Ano · LIC",
    ]);
    expect(plan.subjects).toEqual([]);
  });

  it("sem níveis escolhidos não planeia nada (fica o comportamento antigo)", () => {
    expect(planSchoolStructure([])).toEqual({ levels: [], programs: [], grades: [], subjects: [] });
  });

  it("códigos únicos dentro do plano (repetir só acrescenta o que falta)", () => {
    const plan = planSchoolStructure(
      ["pre_escolar", "primario", "i_ciclo", "ii_ciclo", "superior"],
      ["cfb", "cej", "letras", "tecnico"],
    );
    for (const list of [plan.levels, plan.programs, plan.grades, plan.subjects]) {
      const codes = list.map((item) => item.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("os nomes das classes são reconhecidos pelo ciclo certo nas pautas", () => {
    const plan = planSchoolStructure(["primario", "i_ciclo", "ii_ciclo"], ["cej"]);
    const cycle = (name: string) => inferTeachingCycle(name);
    expect(cycle(plan.grades.find((g) => g.sequence === 4)!.name)).toBe("primario");
    expect(cycle(plan.grades.find((g) => g.sequence === 8)!.name)).toBe("i_ciclo");
    expect(cycle(plan.grades.find((g) => g.sequence === 11)!.name)).toBe("ii_ciclo");
  });
});
