import { describe, expect, it } from "vitest";
import {
  DEFAULT_HIGHER_ED_REGULATION as REG,
  REGULATION_PRESETS,
  applyRegulationPreset,
  ectsGrade,
  finalMention,
  formatGrade,
  fromDisplayGrade,
  gpaPoints,
  toDisplayGrade,
  gradeForLetter,
  letterFor,
  regulationForCountry,
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

  it("resumo curto em três linhas", () => {
    expect(describeHigherEdRegulation(REG)).toEqual([
      "Aprova com 10 valores · frequência 40% / exame 60% · dispensa com 14 valores",
      "Exame com 7 valores · faltas até 33% · épocas: normal, recurso, especial, melhoria",
      "60 créditos/ano (máx. 75) · transita com 45 · precedências obrigatórias",
    ]);
  });
});

describe("modelos nacionais e internacionais", () => {
  it("todos os modelos são regulamentos válidos e guardam de onde vieram", () => {
    for (const id of Object.keys(REGULATION_PRESETS) as Array<keyof typeof REGULATION_PRESETS>) {
      const reg = applyRegulationPreset(id);
      expect(reg.presetId).toBe(id);
      expect(parseHigherEdRegulation(reg)).toEqual(reg);
    }
  });

  it("Bolonha: 9,5 de avaliação contínua arredonda a 10 e aprova sem exame", () => {
    const reg = applyRegulationPreset("bolonha");
    expect(unitOutcome(reg, { continuous: 9.5 })).toMatchObject({
      status: "dispensado",
      finalGrade: 10,
    });
    expect(unitOutcome(reg, { continuous: 9.4 }).status).toBe("admitido");
    expect(ectsGrade(reg, 15)).toBe("C");
    expect(ectsGrade(reg, 9)).toBe("F");
  });

  it("Brasil: escala 0–10, aprovação directa com 7, exame final com média 5", () => {
    const reg = applyRegulationPreset("brasil");
    expect(toDisplayGrade(reg, 14)).toBe(7);
    expect(fromDisplayGrade(reg, 7)).toBe(14);
    expect(formatGrade(reg, 14)).toBe("7 pontos");
    expect(unitOutcome(reg, { continuous: fromDisplayGrade(reg, 7) }).status).toBe("dispensado");
    // média 5/10 e exame 5/10 → 5 → aprovado
    expect(
      unitOutcome(reg, {
        continuous: fromDisplayGrade(reg, 5),
        normalExam: fromDisplayGrade(reg, 5),
      }).status,
    ).toBe("aprovado");
    // abaixo de 4/10 não vai a exame final
    expect(unitOutcome(reg, { continuous: fromDisplayGrade(reg, 3.5) }).status).toBe(
      "excluido_frequencia",
    );
  });

  it("EUA: percentagens, aprovação a 60%, GPA e honras latinas", () => {
    const reg = applyRegulationPreset("eua");
    expect(formatGrade(reg, 17)).toBe("B"); // 85%
    expect(formatGrade({ ...reg, letterGrades: "nenhuma" }, 17)).toBe("85%");
    expect(gpaPoints(reg, 18)).toBe(3.7); // 90% = A-
    expect(gpaPoints(reg, 19)).toBe(4); // 95% = A
    expect(gpaPoints(reg, 12)).toBe(0.7); // 60% = D-
    expect(gpaPoints(reg, 11)).toBe(0);
    const plain = { ...reg, letterGrades: "nenhuma" as const };
    expect(gpaPoints(plain, 18)).toBe(4);
    expect(gpaPoints(plain, 12)).toBe(1);
    expect(finalMention(reg, null, 3.8)).toBe("Magna cum laude");
    expect(finalMention(reg, null, 3.2)).toBeNull();
  });

  it("menções qualitativas pela média final", () => {
    expect(finalMention(REG, 15.6, null)).toBe("Muito Bom");
    expect(finalMention(REG, 13.4, null)).toBe("Suficiente");
    expect(finalMention(REG, 9, null)).toBeNull();
  });

  it("letras com + e −: letra, valor do meio da banda e GPA", () => {
    const reg = applyRegulationPreset("eua");
    expect(reg.letterGrades).toBe("a_f_mais_menos");
    expect(letterFor(reg, 18.6)).toBe("A"); // 93%
    expect(letterFor(reg, 17.4)).toBe("B+"); // 87%
    expect(letterFor(reg, 11)).toBe("F"); // 55%
    expect(formatGrade(reg, 16)).toBe("B-");
    const b = gradeForLetter(reg, "B")!;
    expect(letterFor(reg, b)).toBe("B");
    expect(gpaPoints(reg, b)).toBe(3);
    expect(gradeForLetter(reg, "Z")).toBeNull();
  });

  it("país escolhe o modelo e o nome dos créditos", () => {
    expect(regulationForCountry("PT")).toMatchObject({ presetId: "bolonha", country: "PT" });
    expect(regulationForCountry("GB")).toMatchObject({
      presetId: "reino_unido",
      creditLabel: "CATS",
      creditsPerYear: 120,
    });
    expect(regulationForCountry("MZ")).toMatchObject({ presetId: "angola", country: "MZ" });
    expect(regulationForCountry("XX").presetId).toBe("angola");
  });

  it("Reino Unido: aprovação a 40% e classificações britânicas", () => {
    const reg = applyRegulationPreset("reino_unido");
    expect(formatGrade(reg, 8)).toBe("40%");
    expect(finalMention(reg, 14.2, null)).toBe("First Class");
    expect(finalMention(reg, 12.4, null)).toBe("Upper Second (2:1)");
  });
});
