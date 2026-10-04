import { describe, expect, it } from "vitest";
import { planCurriculum } from "@/features/academic/curriculum-templates";
import { planSchoolStructure } from "@/features/academic/school-structure-plan";

describe("estrutura académica pelo contexto da escola", () => {
  it("escola primária: 1ª a 6ª classe, sem 10ª nem disciplinas do II Ciclo", () => {
    const plan = planSchoolStructure(["primario"]);
    expect(plan.levels.map((l) => l.code)).toEqual(["EP"]);
    expect(plan.grades.map((g) => g.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.subjects.map((s) => s.code)).not.toContain("FIS");
    expect(plan.classGroups).toEqual([]);
    expect(plan.rooms).toEqual([]);
  });

  it("complexo escolar: Iniciação ao II Ciclo, por ordem", () => {
    const plan = planSchoolStructure(["pre_escolar", "primario", "i_ciclo", "ii_ciclo"], ["cfb"]);
    expect(plan.levels.map((l) => l.code)).toEqual(["INIC", "EP", "ESG1", "ESG2"]);
  });

  it("II Ciclo com cursos: classes por curso com nome distinto, técnico até à 13ª", () => {
    const plan = planSchoolStructure(["ii_ciclo"], ["cfb", "cej", "tecnico"]);
    expect(plan.programs.map((p) => p.code)).toEqual(["ESG2-CFB", "ESG2-CEJ", "ETP-GERAL"]);
    expect(plan.grades.filter((g) => g.programCode === "ESG2-CFB").map((g) => g.name)).toEqual([
      "10ª Classe · CFB",
      "11ª Classe · CFB",
      "12ª Classe · CFB",
    ]);
    const tecnico = plan.grades.filter((g) => g.programCode === "ETP-GERAL");
    expect(tecnico.map((g) => g.sequence)).toEqual([10, 11, 12, 13]);
  });

  it("II Ciclo sem cursos indicados: um II Ciclo geral", () => {
    const plan = planSchoolStructure(["ii_ciclo"]);
    expect(plan.programs.map((p) => p.code)).toEqual(["ESG2-GERAL"]);
    expect(plan.grades.map((g) => g.sequence)).toEqual([10, 11, 12]);
  });

  it("ensino superior: nível ES, licenciatura de partida com anos «1ANO»", () => {
    const plan = planSchoolStructure(["superior"]);
    expect(plan.levels.map((l) => l.code)).toEqual(["ES"]);
    expect(plan.programs[0]).toMatchObject({
      code: "ES-LIC",
      kind: "undergraduate",
      higherEducation: true,
    });
    expect(plan.grades.map((g) => g.code)).toEqual(["1ANO", "2ANO", "3ANO", "4ANO", "5ANO"]);
    expect(plan.grades[0]!.name).toBe("1º Ano · LIC");
    expect(plan.subjects).toEqual([]);
  });

  it("sem níveis escolhidos não planeia nada (fica o comportamento antigo)", () => {
    const plan = planSchoolStructure([]);
    expect(plan.levels).toEqual([]);
    expect(plan.programs).toEqual([]);
  });

  it("mesmos códigos que o «modelo de estrutura»: aplicar os dois não duplica", () => {
    const fromSignup = planSchoolStructure(["primario", "i_ciclo", "ii_ciclo"], ["cfb"]);
    const fromTemplate = planCurriculum({
      courses: { primario: ["EP"], secundario_1: ["ESG1"], secundario_2: ["CFB"] },
      groupsPerGrade: 1,
      shifts: ["morning"],
      capacity: 35,
      createRooms: false,
    });
    const key = (g: { programCode: string; code: string }) => `${g.programCode}|${g.code}`;
    expect(fromSignup.grades.map(key)).toEqual(fromTemplate.grades.map(key));
    expect(fromSignup.levels.map((l) => l.code)).toEqual(fromTemplate.levels.map((l) => l.code));
  });

  it("códigos únicos dentro de cada curso (repetir só acrescenta o que falta)", () => {
    const plan = planSchoolStructure(
      ["pre_escolar", "primario", "i_ciclo", "ii_ciclo", "superior"],
      ["cfb", "cej", "letras", "tecnico"],
    );
    const keys = plan.grades.map((g) => `${g.programCode}|${g.code}`);
    expect(new Set(keys).size).toBe(keys.length);
    const programs = plan.programs.map((p) => p.code);
    expect(new Set(programs).size).toBe(programs.length);
  });
});
