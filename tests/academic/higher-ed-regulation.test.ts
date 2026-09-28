import { describe, expect, it } from "vitest";
import {
  DEFAULT_HIGHER_ED_REGULATION as REG,
  canEnrollCredits,
  describeHigherEdRegulation,
  higherEdRegulationSchema,
  parseHigherEdRegulation,
  unitOutcome,
  yearProgression,
} from "@/features/academic/higher-ed-regulation";

describe("regulamento do ensino superior", () => {
  it("valores por omissão: 10 para aprovar, 40/60, dispensa a 14, admissão a 7, 1/3 de faltas", () => {
    expect(REG).toMatchObject({
      passingGrade: 10,
      continuousWeight: 40,
      exemptionGrade: 14,
      examAdmissionGrade: 7,
      maxAbsencePercentage: 33,
      creditsPerYear: 60,
      progressionPercentage: 75,
    });
  });

  it("faltas a mais excluem antes de tudo", () => {
    expect(unitOutcome(REG, { continuous: 16, absencePercentage: 40 }).status).toBe(
      "excluido_faltas",
    );
  });

  it("frequência abaixo da admissão exclui; acima da dispensa aprova sem exame", () => {
    expect(unitOutcome(REG, { continuous: 6 })).toMatchObject({ status: "excluido_frequencia" });
    expect(unitOutcome(REG, { continuous: 15.4 })).toEqual({
      status: "dispensado",
      finalGrade: 15,
      season: "frequencia",
    });
  });

  it("admitido a exame até haver nota; depois pondera 40/60", () => {
    expect(unitOutcome(REG, { continuous: 11 }).status).toBe("admitido");
    // 12×0,4 + 9×0,6 = 10,2 → 10
    expect(unitOutcome(REG, { continuous: 12, normalExam: 9 })).toEqual({
      status: "aprovado",
      finalGrade: 10,
      season: "normal",
    });
  });

  it("reprovado na normal, aprovado no recurso; sem recurso fica reprovado", () => {
    const input = { continuous: 10, normalExam: 5, appealExam: 12 };
    expect(unitOutcome(REG, input)).toMatchObject({ status: "aprovado", season: "recurso" });
    expect(unitOutcome({ ...REG, appealSeason: false }, input)).toMatchObject({
      status: "reprovado",
      season: "normal",
    });
  });

  it("nota mínima no exame reprova mesmo com média suficiente", () => {
    const reg = { ...REG, minimumExamGrade: 8 };
    // 13×0,4 + 7,5×0,6 = 9,7 → 10, mas o exame fica abaixo de 8
    expect(unitOutcome(reg, { continuous: 13, normalExam: 7.5 }).status).toBe("reprovado");
  });

  it("sem dispensa, até uma frequência de 20 vai a exame", () => {
    expect(unitOutcome({ ...REG, exemptionGrade: null }, { continuous: 19 }).status).toBe(
      "admitido",
    );
  });

  it("progressão por créditos e limite de inscrição", () => {
    expect(yearProgression(REG, 44)).toEqual({ required: 45, earned: 44, advances: false });
    expect(yearProgression(REG, 45).advances).toBe(true);
    expect(canEnrollCredits(REG, 70, 5)).toBe(true);
    expect(canEnrollCredits(REG, 70, 6)).toBe(false);
  });

  it("recusa regras incoerentes", () => {
    expect(higherEdRegulationSchema.safeParse({ exemptionGrade: 9 }).success).toBe(false);
    expect(higherEdRegulationSchema.safeParse({ examAdmissionGrade: 12 }).success).toBe(false);
    expect(
      higherEdRegulationSchema.safeParse({ creditsPerYear: 60, maxCreditsPerYear: 50 }).success,
    ).toBe(false);
  });

  it("um valor gravado inválido não apaga os outros", () => {
    const reg = parseHigherEdRegulation({ passingGrade: 12, continuousWeight: 500 });
    expect(reg.passingGrade).toBe(12);
    expect(reg.continuousWeight).toBe(40);
    expect(parseHigherEdRegulation(null)).toEqual(REG);
  });

  it("resumo legível", () => {
    const lines = describeHigherEdRegulation(REG);
    expect(lines[0]).toBe("Aprovação com 10 valores; nota final inteira.");
    expect(lines).toContain(
      "60 ECTS por ano, até 75 com cadeiras em atraso; transita com 45 ECTS.",
    );
  });
});
