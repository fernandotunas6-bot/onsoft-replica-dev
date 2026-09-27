import { describe, expect, it } from "vitest";
import { decidePromotionStatus } from "@/features/academic/assessment-engine";
import {
  DEFAULT_PROMOTION_RULES,
  DECREE_424_25_MODEL,
  describePromotionRule,
  parsePromotionRules,
  validateRuleDraft,
  type PromotionRules,
} from "@/features/academic/assessment-model";
import { computeFinalResult, type EngineRule } from "@/features/academic/exam-engine";

describe("regras de transição por ciclo", () => {
  it("por omissão, decidem como o SIGA sempre decidiu", () => {
    // Primário: só a média.
    expect(decidePromotionStatus(10, 5, "primario")).toBe("TRANSITA");
    expect(decidePromotionStatus(9.9, 0, "primario")).toBe("NÃO TRANSITA");
    // I Ciclo: média e até 2 negativas.
    expect(decidePromotionStatus(12, 2, "i_ciclo")).toBe("TRANSITA");
    expect(decidePromotionStatus(12, 3, "i_ciclo")).toBe("NÃO TRANSITA");
    // II Ciclo: sem negativas; admitido a exame a partir de 9.
    expect(decidePromotionStatus(12, 0, "ii_ciclo")).toBe("TRANSITA");
    expect(decidePromotionStatus(12, 1, "ii_ciclo")).toBe("ADMITIDO A EXAME");
    expect(decidePromotionStatus(9, 3, "ii_ciclo")).toBe("ADMITIDO A EXAME");
    expect(decidePromotionStatus(8.9, 0, "ii_ciclo")).toBe("NÃO TRANSITA");
    // Técnico: PAP.
    expect(decidePromotionStatus(12, 2, "tecnico")).toBe("APTO (PAP)");
    expect(decidePromotionStatus(12, 2, "tecnico", 8)).toBe("NÃO APTO (PAP)");
    expect(decidePromotionStatus(12, 3, "tecnico")).toBe("NÃO TRANSITA");
    // Adultos e superior seguem o I Ciclo.
    expect(decidePromotionStatus(12, 3, "adultos")).toBe("NÃO TRANSITA");
  });

  it("com o modelo da escola, mandam a nota de aprovação e as regras publicadas", () => {
    const rules: PromotionRules = {
      ...DEFAULT_PROMOTION_RULES,
      i_ciclo: { maxFailedSubjects: 0, examAdmissionMinimum: 8, requiresPap: false },
    };
    const options = { passing: 11, rules };
    expect(decidePromotionStatus(10.5, 0, "i_ciclo", null, options)).toBe("ADMITIDO A EXAME");
    expect(decidePromotionStatus(12, 1, "i_ciclo", null, options)).toBe("ADMITIDO A EXAME");
    expect(decidePromotionStatus(12, 0, "i_ciclo", null, options)).toBe("TRANSITA");
    expect(decidePromotionStatus(7.5, 0, "i_ciclo", null, options)).toBe("NÃO TRANSITA");
  });

  it("lê as regras do modelo guardado e completa o que faltar", () => {
    expect(parsePromotionRules(null)).toEqual(DEFAULT_PROMOTION_RULES);
    const parsed = parsePromotionRules({
      promotion: { ii_ciclo: { maxFailedSubjects: 1, examAdmissionMinimum: null } },
    });
    expect(parsed.ii_ciclo).toEqual({
      maxFailedSubjects: 1,
      examAdmissionMinimum: null,
      requiresPap: false,
    });
    expect(parsed.i_ciclo).toEqual(DEFAULT_PROMOTION_RULES.i_ciclo);
    expect(describePromotionRule(parsed.ii_ciclo)).toBe("até 1 negativa(s)");
    expect(describePromotionRule(DEFAULT_PROMOTION_RULES.tecnico, 10)).toBe(
      "média ≥ 10 · até 2 negativa(s) · PAP obrigatória",
    );
  });

  it("valida as regras antes de publicar", () => {
    const scale = { minimum: 0, maximum: 20, decimalPlaces: 0 };
    const draft = {
      ...DECREE_424_25_MODEL,
      maximumAbsencePercentage: 30,
      promotionRules: {
        ...DEFAULT_PROMOTION_RULES,
        ii_ciclo: { maxFailedSubjects: 0, examAdmissionMinimum: 12, requiresPap: false },
        i_ciclo: { maxFailedSubjects: -1, examAdmissionMinimum: null, requiresPap: false },
      },
    };
    const messages = validateRuleDraft(draft, scale).map((i) => i.message);
    expect(messages).toContain("I Ciclo: o máximo de negativas vai de 0 a 30 (ou vazio).");
    expect(messages).toContain(
      "II Ciclo: a admissão a exame não pode ser acima da nota de aprovação.",
    );
  });

  it("o resultado final (histórico) aplica a regra do ciclo da turma", () => {
    const base: EngineRule = {
      passingValue: 10,
      maximumAbsencePercentage: null,
      roundingMethod: "nearest",
      decimalPlaces: 0,
      keySubjectsCauseFailure: false,
    };
    const subjects = [
      { subjectId: "a", subjectName: "A", average: 14, isKeySubject: false },
      { subjectId: "b", subjectName: "B", average: 14, isKeySubject: false },
      { subjectId: "c", subjectName: "C", average: 8, isKeySubject: false },
    ];
    expect(computeFinalResult(subjects, 0, base).result).toBe("pass");
    expect(
      computeFinalResult(subjects, 0, { ...base, promotion: DEFAULT_PROMOTION_RULES.ii_ciclo }),
    ).toMatchObject({ result: "fail", reason: "Admitido a exame" });
    expect(
      computeFinalResult(subjects, 0, {
        ...base,
        promotion: { maxFailedSubjects: 0, examAdmissionMinimum: null, requiresPap: false },
      }).reason,
    ).toBe("Negativas não permitidas neste ciclo");
    expect(
      computeFinalResult(subjects, 0, { ...base, promotion: DEFAULT_PROMOTION_RULES.i_ciclo })
        .result,
    ).toBe("pass");
  });
});
