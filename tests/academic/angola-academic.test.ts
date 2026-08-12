import { describe, expect, it } from "vitest";
import {
  annualAverage,
  formatScore,
  gradeMatchesTeachingLevels,
  initialsFromName,
  parsePautaScore,
  recursoFinal,
  scoreAverage,
  situacaoPauta,
  subjectShortCode,
} from "@/lib/angola-academic";
import { pedagogySettingsSchema } from "@/features/school/schemas";

describe("angola academic pauta", () => {
  it("calcula a média MAC/NPP/NPT na escala 0–20", () => {
    expect(scoreAverage(12, 10, 14)).toBeCloseTo(12);
    expect(situacaoPauta(10).label).toBe("Transita");
    expect(situacaoPauta(9.9).label).toBe("Não transita");
  });

  it("reconhece classes angolanas nos níveis activos", () => {
    expect(gradeMatchesTeachingLevels("7ª Classe", ["i_ciclo"])).toBe(true);
    expect(gradeMatchesTeachingLevels("7ª Classe", ["primario"])).toBe(false);
    expect(gradeMatchesTeachingLevels("Iniciação A", ["pre_escolar"])).toBe(true);
    expect(gradeMatchesTeachingLevels("Qualquer", [])).toBe(true);
  });

  it("gera iniciais para a foto da pauta", () => {
    expect(initialsFromName("Ana Silva Costa")).toBe("AS");
  });

  it("valida a configuração pedagógica da escola", () => {
    const parsed = pedagogySettingsSchema.parse({
      teachingLevels: ["primario", "i_ciclo"],
      courses: ["cfb"],
      closedTerms: [1],
    });
    expect(parsed.teachingLevels).toEqual(["primario", "i_ciclo"]);
    expect(parsed.closedTerms).toEqual([1]);
    expect(pedagogySettingsSchema.parse({}).teachingLevels).toEqual([]);
    expect(pedagogySettingsSchema.parse({}).closedTerms).toEqual([]);
  });

  it("calcula a média anual e códigos curtos da pauta geral", () => {
    expect(annualAverage([12, 10, 14])).toBeCloseTo(12);
    expect(annualAverage([12, null, undefined])).toBeCloseTo(12);
    expect(annualAverage([null, null])).toBeNull();
    expect(formatScore(12.46)).toBe("12.5");
    expect(subjectShortCode("Língua Portuguesa")).toBe("LP");
    expect(subjectShortCode("Química Aplicada", "qui")).toBe("QUI");
  });

  it("valida células 0–20 e calcula recurso sem apagar a nota original", () => {
    expect(parsePautaScore("15")).toBe(15);
    expect(parsePautaScore("15,5")).toBe(15.5);
    expect(Number.isNaN(parsePautaScore("21"))).toBe(true);
    expect(parsePautaScore("")).toBeNull();
    expect(recursoFinal(8.5, 14)).toBeCloseTo(11.25);
    expect(recursoFinal(8.5, null)).toBe(8.5);
  });
});
