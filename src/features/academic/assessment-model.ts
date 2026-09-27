/**
 * Modelos de avaliação (puro): a regra da escola, o modelo por omissão e as
 * validações que a base também faz (`siga_publish_assessment_rule`).
 *
 * Nenhum limiar é inventado: o modelo por omissão é o do Decreto Executivo
 * n.º 424/25 (MT = (MAC + NPT) ÷ 2, aprovação a 10 na escala 0–20). O limite
 * de faltas não está nesse decreto como número único, por isso a escola
 * indica-o sempre.
 */

export const ROUNDING_METHODS = ["nearest", "up", "down", "none"] as const;
export type RoundingMethod = (typeof ROUNDING_METHODS)[number];

export const ROUNDING_LABELS: Record<RoundingMethod, string> = {
  nearest: "Ao mais próximo",
  up: "Sempre para cima",
  down: "Sempre para baixo",
  none: "Sem arredondamento",
};

/**
 * Opções de cálculo que o director escolhe no modelo (guardadas em
 * `formula.calculation`). As omissões são o comportamento do Decreto 424/25.
 */
export const NPP_MODES = ["in_mac", "in_continuous"] as const;
export type NppMode = (typeof NPP_MODES)[number];
export const NPP_MODE_LABELS: Record<NppMode, string> = {
  in_mac: "Já incluída no MAC (não conta à parte)",
  in_continuous: "Conta na parte contínua, com o MAC",
};

export const RECOVERY_METHODS = ["average", "replace", "max"] as const;
export type RecoveryMethod = (typeof RECOVERY_METHODS)[number];
export const RECOVERY_METHOD_LABELS: Record<RecoveryMethod, string> = {
  average: "Média entre a nota anterior e a de recurso",
  replace: "A nota de recurso substitui a anterior",
  max: "Fica a maior das duas",
};

export type CalculationOptions = { nppMode: NppMode; recoveryMethod: RecoveryMethod };

export const DEFAULT_CALCULATION_OPTIONS: CalculationOptions = {
  nppMode: "in_mac",
  recoveryMethod: "average",
};

export function parseCalculationOptions(formula: unknown): CalculationOptions {
  const calc =
    formula && typeof formula === "object"
      ? ((formula as Record<string, unknown>)["calculation"] as Record<string, unknown> | undefined)
      : undefined;
  const npp = calc?.["nppMode"];
  const recovery = calc?.["recoveryMethod"];
  return {
    nppMode: (NPP_MODES as readonly unknown[]).includes(npp)
      ? (npp as NppMode)
      : DEFAULT_CALCULATION_OPTIONS.nppMode,
    recoveryMethod: (RECOVERY_METHODS as readonly unknown[]).includes(recovery)
      ? (recovery as RecoveryMethod)
      : DEFAULT_CALCULATION_OPTIONS.recoveryMethod,
  };
}

/** Parte contínua do período: o MAC, ou a média de MAC e NPP se o modelo o pedir. */
export function continuousComponent(mac: number, npp: number | null, mode: NppMode) {
  return mode === "in_continuous" && npp != null ? (mac + npp) / 2 : mac;
}

/** Nota depois do recurso, pelo método do modelo. */
export function recoveryResult(
  original: number | null,
  recovery: number | null,
  method: RecoveryMethod,
) {
  if (original == null) return recovery;
  if (recovery == null) return original;
  if (method === "replace") return recovery;
  if (method === "max") return Math.max(original, recovery);
  return (original + recovery) / 2;
}

/* ── Regras de transição por ciclo ─────────────────────────────────────── */

export const PROMOTION_CYCLES = ["primario", "i_ciclo", "ii_ciclo", "tecnico"] as const;
export type PromotionCycle = (typeof PROMOTION_CYCLES)[number];

export const PROMOTION_CYCLE_LABELS: Record<PromotionCycle, string> = {
  primario: "Primário",
  i_ciclo: "I Ciclo",
  ii_ciclo: "II Ciclo",
  tecnico: "Técnico-profissional",
};

export type PromotionCycleRule = {
  /** Máximo de disciplinas em negativa para transitar (null = sem limite). */
  maxFailedSubjects: number | null;
  /** Sem transitar, média mínima para ser admitido a exame (null = não há). */
  examAdmissionMinimum: number | null;
  /** Exige Prova de Aptidão Profissional (resultado "Apto (PAP)"). */
  requiresPap: boolean;
};

export type PromotionRules = Record<PromotionCycle, PromotionCycleRule>;

/** As regras que o SIGA já aplicava; a escola pode mudá-las no modelo. */
export const DEFAULT_PROMOTION_RULES: PromotionRules = {
  primario: { maxFailedSubjects: null, examAdmissionMinimum: null, requiresPap: false },
  i_ciclo: { maxFailedSubjects: 2, examAdmissionMinimum: null, requiresPap: false },
  ii_ciclo: { maxFailedSubjects: 0, examAdmissionMinimum: 9, requiresPap: false },
  tecnico: { maxFailedSubjects: 2, examAdmissionMinimum: null, requiresPap: true },
};

const intOrNull = (v: unknown) =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v));
const numOrNull = (v: unknown) =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

/** Lê `formula.promotion` da regra guardada; o que faltar vem das regras por omissão. */
export function parsePromotionRules(formula: unknown): PromotionRules {
  const promotion =
    formula && typeof formula === "object"
      ? ((formula as Record<string, unknown>)["promotion"] as Record<string, unknown> | undefined)
      : undefined;
  const out = {} as PromotionRules;
  for (const cycle of PROMOTION_CYCLES) {
    const base = DEFAULT_PROMOTION_RULES[cycle];
    const given = promotion?.[cycle] as Record<string, unknown> | undefined;
    out[cycle] = given
      ? {
          maxFailedSubjects:
            "maxFailedSubjects" in given
              ? intOrNull(given["maxFailedSubjects"])
              : base.maxFailedSubjects,
          examAdmissionMinimum:
            "examAdmissionMinimum" in given
              ? numOrNull(given["examAdmissionMinimum"])
              : base.examAdmissionMinimum,
          requiresPap: "requiresPap" in given ? given["requiresPap"] === true : base.requiresPap,
        }
      : { ...base };
  }
  return out;
}

/** Adultos e superior seguem a regra do I Ciclo, como até aqui. */
export function promotionRuleFor(rules: PromotionRules, cycle: string): PromotionCycleRule {
  return (PROMOTION_CYCLES as readonly string[]).includes(cycle)
    ? rules[cycle as PromotionCycle]
    : rules.i_ciclo;
}

export function describePromotionRule(rule: PromotionCycleRule, passing?: number): string {
  const parts = [
    ...(passing == null ? [] : [`média ≥ ${passing}`]),
    rule.maxFailedSubjects == null
      ? "sem limite de negativas"
      : rule.maxFailedSubjects === 0
        ? "sem negativas"
        : `até ${rule.maxFailedSubjects} negativa(s)`,
  ];
  if (rule.examAdmissionMinimum != null)
    parts.push(`exame a partir de ${rule.examAdmissionMinimum}`);
  if (rule.requiresPap) parts.push("PAP obrigatória");
  return parts.join(" · ");
}

export type AssessmentScale = {
  minimum: number;
  maximum: number;
  decimalPlaces: number;
};

export type AssessmentRuleDraft = {
  name: string;
  continuousWeight: number;
  examWeight: number;
  passingValue: number;
  maximumAbsencePercentage: number | null;
  roundingMethod: RoundingMethod;
  gradeChangeRequiresApproval: boolean;
  lockAfterPublication: boolean;
  keySubjectIds: string[];
  keySubjectsCauseFailure: boolean;
  promotionRules: PromotionRules;
  calculation: CalculationOptions;
};

export type AssessmentRuleVersion = AssessmentRuleDraft & {
  id: string;
  version: number;
  status: "active" | "retired";
  createdAt: string;
  createdByName: string | null;
};

/** Decreto Executivo n.º 424/25: MAC e NPT com o mesmo peso, aprovação a 10. */
export const DECREE_424_25_MODEL: Omit<AssessmentRuleDraft, "maximumAbsencePercentage"> = {
  name: "Decreto Executivo n.º 424/25",
  continuousWeight: 50,
  examWeight: 50,
  passingValue: 10,
  roundingMethod: "nearest",
  gradeChangeRequiresApproval: true,
  lockAfterPublication: true,
  keySubjectIds: [],
  keySubjectsCauseFailure: true,
  promotionRules: DEFAULT_PROMOTION_RULES,
  calculation: DEFAULT_CALCULATION_OPTIONS,
};

export function draftFromRule(rule: AssessmentRuleVersion | null): AssessmentRuleDraft {
  const copyRules = (rules: PromotionRules) =>
    Object.fromEntries(
      PROMOTION_CYCLES.map((cycle) => [cycle, { ...rules[cycle] }]),
    ) as PromotionRules;
  if (!rule) {
    return {
      ...DECREE_424_25_MODEL,
      maximumAbsencePercentage: null,
      promotionRules: copyRules(DEFAULT_PROMOTION_RULES),
      calculation: { ...DEFAULT_CALCULATION_OPTIONS },
    };
  }
  const { id: _id, version: _v, status: _s, createdAt: _c, createdByName: _n, ...draft } = rule;
  return {
    ...draft,
    keySubjectIds: [...draft.keySubjectIds],
    promotionRules: copyRules(draft.promotionRules ?? DEFAULT_PROMOTION_RULES),
    calculation: { ...(draft.calculation ?? DEFAULT_CALCULATION_OPTIONS) },
  };
}

export type RuleIssue = { field: keyof AssessmentRuleDraft; message: string };

export function validateRuleDraft(
  draft: AssessmentRuleDraft,
  scale: AssessmentScale | null,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  if (!scale) {
    issues.push({ field: "passingValue", message: "A escola não tem escala de notas activa." });
  }
  const weights = [draft.continuousWeight, draft.examWeight];
  if (weights.some((w) => !Number.isFinite(w) || w < 0 || w > 100)) {
    issues.push({ field: "continuousWeight", message: "Os pesos vão de 0 a 100." });
  } else if (draft.continuousWeight + draft.examWeight !== 100) {
    issues.push({ field: "examWeight", message: "Os pesos têm de somar 100." });
  }
  if (!Number.isFinite(draft.passingValue)) {
    issues.push({ field: "passingValue", message: "Indique a nota mínima de aprovação." });
  } else if (scale && (draft.passingValue < scale.minimum || draft.passingValue > scale.maximum)) {
    issues.push({
      field: "passingValue",
      message: `A nota de aprovação fica entre ${scale.minimum} e ${scale.maximum}.`,
    });
  }
  const absence = draft.maximumAbsencePercentage;
  if (absence === null || !Number.isFinite(absence)) {
    issues.push({
      field: "maximumAbsencePercentage",
      message: "Indique o limite de faltas (%) aprovado pela escola.",
    });
  } else if (absence < 0 || absence > 100) {
    issues.push({
      field: "maximumAbsencePercentage",
      message: "O limite de faltas vai de 0 a 100%.",
    });
  }
  if (draft.name.trim().length > 120) {
    issues.push({ field: "name", message: "Nome demasiado longo (máx. 120)." });
  }
  for (const cycle of PROMOTION_CYCLES) {
    const rule = draft.promotionRules[cycle];
    const label = PROMOTION_CYCLE_LABELS[cycle];
    if (
      rule.maxFailedSubjects != null &&
      (!Number.isInteger(rule.maxFailedSubjects) ||
        rule.maxFailedSubjects < 0 ||
        rule.maxFailedSubjects > 30)
    ) {
      issues.push({
        field: "promotionRules",
        message: `${label}: o máximo de negativas vai de 0 a 30 (ou vazio).`,
      });
    }
    const admission = rule.examAdmissionMinimum;
    if (admission != null) {
      if (!Number.isFinite(admission) || (scale && admission < scale.minimum)) {
        issues.push({ field: "promotionRules", message: `${label}: admissão a exame inválida.` });
      } else if (Number.isFinite(draft.passingValue) && admission > draft.passingValue) {
        issues.push({
          field: "promotionRules",
          message: `${label}: a admissão a exame não pode ser acima da nota de aprovação.`,
        });
      }
    }
  }
  return issues;
}

/** Arredondamento igual a `private.round_grade`. */
export function roundGrade(value: number, method: RoundingMethod, decimalPlaces: number) {
  const factor = 10 ** Math.max(0, decimalPlaces);
  switch (method) {
    case "nearest":
      return Math.round(value * factor) / factor;
    case "up":
      return Math.ceil(value * factor) / factor;
    case "down":
      return Math.floor(value * factor) / factor;
    default:
      return value;
  }
}

/** Média do período pela regra: (MAC × peso contínuo + NPT × peso prova) ÷ 100. */
export function termAverageByRule(
  mac: number,
  npt: number,
  rule: Pick<AssessmentRuleDraft, "continuousWeight" | "examWeight" | "roundingMethod">,
  decimalPlaces: number,
) {
  const raw = (mac * rule.continuousWeight + npt * rule.examWeight) / 100;
  return roundGrade(raw, rule.roundingMethod, decimalPlaces);
}

export function formulaText(
  rule: Pick<AssessmentRuleDraft, "continuousWeight" | "examWeight"> & {
    calculation?: CalculationOptions;
  },
) {
  const continuous = rule.calculation?.nppMode === "in_continuous" ? "(MAC + NPP) ÷ 2" : "MAC";
  const wrapped = continuous === "MAC" ? "MAC" : `[${continuous}]`;
  if (rule.continuousWeight === 50 && rule.examWeight === 50) return `MT = (${wrapped} + NPT) ÷ 2`;
  return `MT = ${wrapped} × ${rule.continuousWeight}% + NPT × ${rule.examWeight}%`;
}

export type RuleChange = { label: string; from: string; to: string };

const yesNo = (value: boolean) => (value ? "Sim" : "Não");

/** O que muda entre a regra activa e o rascunho (para confirmar antes de publicar). */
export function ruleChanges(
  current: AssessmentRuleDraft | null,
  next: AssessmentRuleDraft,
): RuleChange[] {
  if (!current) return [];
  const rows: Array<[string, string, string]> = [
    ["Fórmula", formulaText(current), formulaText(next)],
    ["Aprovação", String(current.passingValue), String(next.passingValue)],
    [
      "Limite de faltas",
      `${current.maximumAbsencePercentage ?? "—"}%`,
      `${next.maximumAbsencePercentage ?? "—"}%`,
    ],
    [
      "Arredondamento",
      ROUNDING_LABELS[current.roundingMethod],
      ROUNDING_LABELS[next.roundingMethod],
    ],
    [
      "Alteração de nota com aprovação",
      yesNo(current.gradeChangeRequiresApproval),
      yesNo(next.gradeChangeRequiresApproval),
    ],
    [
      "Bloquear depois de publicar",
      yesNo(current.lockAfterPublication),
      yesNo(next.lockAfterPublication),
    ],
    ["Disciplinas-chave", String(current.keySubjectIds.length), String(next.keySubjectIds.length)],
    [
      "Negativa em disciplina-chave reprova",
      yesNo(current.keySubjectsCauseFailure),
      yesNo(next.keySubjectsCauseFailure),
    ],
    [
      "NPP",
      NPP_MODE_LABELS[(current.calculation ?? DEFAULT_CALCULATION_OPTIONS).nppMode],
      NPP_MODE_LABELS[(next.calculation ?? DEFAULT_CALCULATION_OPTIONS).nppMode],
    ],
    [
      "Recurso",
      RECOVERY_METHOD_LABELS[(current.calculation ?? DEFAULT_CALCULATION_OPTIONS).recoveryMethod],
      RECOVERY_METHOD_LABELS[(next.calculation ?? DEFAULT_CALCULATION_OPTIONS).recoveryMethod],
    ],
  ];
  for (const cycle of PROMOTION_CYCLES) {
    rows.push([
      `Transição · ${PROMOTION_CYCLE_LABELS[cycle]}`,
      describePromotionRule(current.promotionRules[cycle]),
      describePromotionRule(next.promotionRules[cycle]),
    ]);
  }
  const sameKeys =
    current.keySubjectIds.length === next.keySubjectIds.length &&
    current.keySubjectIds.every((id) => next.keySubjectIds.includes(id));
  return rows
    .filter(([label, from, to]) => from !== to || (label === "Disciplinas-chave" && !sameKeys))
    .map(([label, from, to]) => ({ label, from, to }));
}
