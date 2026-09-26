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
};

export function draftFromRule(rule: AssessmentRuleVersion | null): AssessmentRuleDraft {
  if (!rule) return { ...DECREE_424_25_MODEL, maximumAbsencePercentage: null };
  const { id: _id, version: _v, status: _s, createdAt: _c, createdByName: _n, ...draft } = rule;
  return { ...draft, keySubjectIds: [...draft.keySubjectIds] };
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

export function formulaText(rule: Pick<AssessmentRuleDraft, "continuousWeight" | "examWeight">) {
  if (rule.continuousWeight === 50 && rule.examWeight === 50) return "MT = (MAC + NPT) ÷ 2";
  return `MT = MAC × ${rule.continuousWeight}% + NPT × ${rule.examWeight}%`;
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
  ];
  const sameKeys =
    current.keySubjectIds.length === next.keySubjectIds.length &&
    current.keySubjectIds.every((id) => next.keySubjectIds.includes(id));
  return rows
    .filter(([label, from, to]) => from !== to || (label === "Disciplinas-chave" && !sameKeys))
    .map(([label, from, to]) => ({ label, from, to }));
}
