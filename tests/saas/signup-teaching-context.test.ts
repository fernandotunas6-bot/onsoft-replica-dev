import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSchoolWizardInputSchema } from "@/features/saas/schemas";
import { gradeMatchesTeachingLevels, inferTeachingCycle } from "@/lib/angola-academic";

const base = {
  name: "Complexo Escolar Esperança",
  nif: "5417089623",
  contact_name: "Ana Silva",
  contact_email: "ana@escola.ao",
  plan_code: "start",
  slug: "complexo-esperanca",
  admin_email: "admin@escola.ao",
  admin_name: "Ana Silva",
};

describe("registo: contexto pedagógico do cliente", () => {
  it("aceita níveis e cursos válidos, sem repetidos, e descarta desconhecidos", () => {
    const parsed = createSchoolWizardInputSchema.parse({
      ...base,
      teaching_levels: ["primario", "i_ciclo", "primario", "universidade"],
      secondary_courses: ["cfb", "medicina"],
    });
    expect(parsed.teaching_levels).toEqual(["primario", "i_ciclo"]);
    expect(parsed.secondary_courses).toEqual(["cfb"]);
  });

  it("sem os campos (WEB antigo) continua a aceitar o registo", () => {
    const parsed = createSchoolWizardInputSchema.parse(base);
    expect(parsed.teaching_levels).toBeUndefined();
  });

  it("o provisionamento guarda os níveis e cria logo a estrutura dessa escola", () => {
    const source = readFileSync("src/features/saas/provisioning-core.ts", "utf8");
    expect(source).toContain('domain: "pedagogy"');
    expect(source).toContain("teachingLevels: data.teaching_levels");
    expect(source).toContain("seedSchoolStructureFromSettings(db, {");
  });

  it("«Preparar estrutura» usa o contexto da escola antes do esqueleto genérico", () => {
    const source = readFileSync("src/features/academic/academic-bootstrap.ts", "utf8");
    const core = source.slice(source.indexOf("export async function ensureAcademicDefaultsCore"));
    expect(core.indexOf("seedSchoolStructureFromSettings(")).toBeLessThan(
      core.indexOf("requireConfiguredAcademicCalendar("),
    );
  });
});

describe("reconhecimento do ciclo pela classe", () => {
  it("11ª e 12ª são II Ciclo, não 1ª e 2ª do primário", () => {
    expect(inferTeachingCycle("11ª Classe")).toBe("ii_ciclo");
    expect(inferTeachingCycle("12.ª Classe")).toBe("ii_ciclo");
    expect(inferTeachingCycle("1.ª Classe")).toBe("primario");
    expect(inferTeachingCycle("8ª Classe")).toBe("i_ciclo");
  });

  it("uma escola só com primário não apanha as turmas do II Ciclo", () => {
    expect(gradeMatchesTeachingLevels("12ª Classe", ["primario"])).toBe(false);
    expect(gradeMatchesTeachingLevels("2ª Classe", ["primario"])).toBe(true);
  });
});
