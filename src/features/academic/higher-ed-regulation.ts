/**
 * Regulamento académico de uma instituição de ensino superior.
 *
 * No ensino geral as regras vêm do Decreto 424/25; no superior cada instituição
 * aprova o seu regulamento. Por isso nada aqui é fixo: os valores por omissão
 * são os mais comuns nas universidades angolanas (aprovação a 10, dispensa de
 * exame a 14, admissão a exame a 7, faltas até 1/3, 60 ECTS por ano) e o
 * Administrador muda-os em Definições → Pedagógico.
 *
 * Guardado em `school_settings` (domínio `higher_education`), à parte das
 * definições pedagógicas, que são regravadas inteiras a cada gravação.
 * Funções puras: testadas em tests/academic/higher-ed-regulation.test.ts.
 */
import { z } from "zod";

const grade = z.number().min(0).max(20);

export const higherEdRegulationSchema = z
  .object({
    /** Nota mínima de aprovação numa unidade curricular (0–20). */
    passingGrade: grade.default(10),
    /** Peso da frequência (avaliação contínua) na nota final, em %. O exame fica com o resto. */
    continuousWeight: z.number().int().min(0).max(100).default(40),
    /** Média de frequência que dispensa o exame. `null`: ninguém é dispensado. */
    exemptionGrade: grade.nullable().default(14),
    /** Média de frequência mínima para ir a exame. Abaixo disto o estudante é excluído. */
    examAdmissionGrade: grade.default(7),
    /** Faltas acima desta percentagem das aulas excluem da unidade curricular. */
    maxAbsencePercentage: z.number().min(0).max(100).default(33),
    /** Nota mínima no exame, mesmo com boa frequência (nota eliminatória). `null`: sem mínimo. */
    minimumExamGrade: grade.nullable().default(null),
    /** Épocas de exame em uso. A normal existe sempre. */
    appealSeason: z.boolean().default(true),
    specialSeason: z.boolean().default(true),
    /** Máximo de unidades curriculares em época de recurso por semestre. `null`: sem limite. */
    appealMaxUnits: z.number().int().min(1).max(20).nullable().default(null),
    /** Exame de melhoria de nota para quem já foi aprovado. */
    gradeImprovement: z.boolean().default(true),
    /** Créditos ECTS de um ano curricular completo. */
    creditsPerYear: z.number().int().min(1).max(120).default(60),
    /** Máximo de créditos em que se pode inscrever num ano (cadeiras em atraso incluídas). */
    maxCreditsPerYear: z.number().int().min(1).max(150).default(75),
    /** Percentagem dos créditos do ano necessária para transitar (75% de 60 = 45 ECTS). */
    progressionPercentage: z.number().int().min(0).max(100).default(75),
    /** Recusa a inscrição numa cadeira sem as precedências aprovadas. */
    enforcePrerequisites: z.boolean().default(true),
    /** Casas decimais da nota final da unidade curricular (0 = inteira, como na pauta). */
    finalGradeDecimals: z.union([z.literal(0), z.literal(1)]).default(0),
  })
  .refine((reg) => reg.maxCreditsPerYear >= reg.creditsPerYear, {
    message: "O máximo de créditos por ano não pode ser menor do que os créditos do ano.",
    path: ["maxCreditsPerYear"],
  })
  .refine((reg) => reg.exemptionGrade == null || reg.exemptionGrade >= reg.passingGrade, {
    message: "A nota de dispensa não pode ser inferior à nota de aprovação.",
    path: ["exemptionGrade"],
  })
  .refine((reg) => reg.examAdmissionGrade <= reg.passingGrade, {
    message: "A nota de admissão a exame não pode ser superior à nota de aprovação.",
    path: ["examAdmissionGrade"],
  });

export type HigherEdRegulation = z.infer<typeof higherEdRegulationSchema>;

export const DEFAULT_HIGHER_ED_REGULATION: HigherEdRegulation = higherEdRegulationSchema.parse({});

/** Lê o que está gravado; um valor inválido ou em falta volta ao valor por omissão. */
export function parseHigherEdRegulation(value: unknown): HigherEdRegulation {
  const parsed = higherEdRegulationSchema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;
  // Campo a campo: um valor antigo fora dos limites não apaga os outros.
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...DEFAULT_HIGHER_ED_REGULATION };
  for (const key of Object.keys(DEFAULT_HIGHER_ED_REGULATION)) {
    const attempt = higherEdRegulationSchema.safeParse({ ...merged, [key]: source[key] });
    if (attempt.success) merged[key] = attempt.data[key as keyof HigherEdRegulation];
  }
  return higherEdRegulationSchema.safeParse(merged).data ?? DEFAULT_HIGHER_ED_REGULATION;
}

const round = (value: number, decimals: 0 | 1) => {
  const factor = decimals === 1 ? 10 : 1;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export type UnitOutcomeStatus =
  | "pendente"
  | "excluido_faltas"
  | "excluido_frequencia"
  | "dispensado"
  | "admitido"
  | "aprovado"
  | "reprovado";

export type UnitOutcome = {
  status: UnitOutcomeStatus;
  /** Nota final da unidade curricular, quando já se sabe. */
  finalGrade: number | null;
  /** Época em que a nota foi obtida. */
  season: "frequencia" | "normal" | "recurso" | "especial" | null;
};

/**
 * Resultado de uma unidade curricular segundo o regulamento.
 *
 * Ordem: faltas → frequência (exclusão ou dispensa) → exame normal → recurso →
 * especial. A nota de cada época substitui o exame da anterior; a frequência
 * conta sempre com o seu peso, excepto na dispensa, onde é a nota final.
 */
export function unitOutcome(
  reg: HigherEdRegulation,
  input: {
    continuous: number | null;
    absencePercentage?: number | null;
    normalExam?: number | null;
    appealExam?: number | null;
    specialExam?: number | null;
  },
): UnitOutcome {
  const { continuous } = input;
  if ((input.absencePercentage ?? 0) > reg.maxAbsencePercentage) {
    return { status: "excluido_faltas", finalGrade: null, season: null };
  }
  if (continuous == null) return { status: "pendente", finalGrade: null, season: null };
  if (continuous < reg.examAdmissionGrade) {
    return {
      status: "excluido_frequencia",
      finalGrade: round(continuous, reg.finalGradeDecimals),
      season: "frequencia",
    };
  }
  if (reg.exemptionGrade != null && continuous >= reg.exemptionGrade) {
    return {
      status: "dispensado",
      finalGrade: round(continuous, reg.finalGradeDecimals),
      season: "frequencia",
    };
  }

  const seasons: Array<[UnitOutcome["season"], number | null | undefined, boolean]> = [
    ["normal", input.normalExam, true],
    ["recurso", input.appealExam, reg.appealSeason],
    ["especial", input.specialExam, reg.specialSeason],
  ];
  let last: UnitOutcome | null = null;
  for (const [season, exam, enabled] of seasons) {
    if (!enabled || exam == null) continue;
    const weighted =
      (continuous * reg.continuousWeight + exam * (100 - reg.continuousWeight)) / 100;
    const finalGrade = round(weighted, reg.finalGradeDecimals);
    const examOk = reg.minimumExamGrade == null || exam >= reg.minimumExamGrade;
    const approved = examOk && finalGrade >= reg.passingGrade;
    last = { status: approved ? "aprovado" : "reprovado", finalGrade, season };
    if (approved) return last;
  }
  return last ?? { status: "admitido", finalGrade: null, season: null };
}

/** Créditos necessários para transitar de ano e se o estudante os tem. */
export function yearProgression(reg: HigherEdRegulation, creditsEarned: number) {
  const required = Math.ceil((reg.creditsPerYear * reg.progressionPercentage) / 100);
  return { required, earned: creditsEarned, advances: creditsEarned >= required };
}

/** Pode inscrever-se em mais esta unidade curricular sem passar o limite do ano? */
export function canEnrollCredits(
  reg: HigherEdRegulation,
  alreadyEnrolled: number,
  unitCredits: number,
) {
  return alreadyEnrolled + unitCredits <= reg.maxCreditsPerYear;
}

/** O regulamento em frases curtas, para o resumo no ecrã e nos documentos. */
export function describeHigherEdRegulation(reg: HigherEdRegulation): string[] {
  const seasons = [
    "normal",
    reg.appealSeason ? "recurso" : null,
    reg.specialSeason ? "especial" : null,
  ].filter(Boolean);
  const progression = yearProgression(reg, 0).required;
  return [
    `Aprovação com ${reg.passingGrade} valores; nota final ${reg.finalGradeDecimals ? "com uma casa decimal" : "inteira"}.`,
    `Frequência ${reg.continuousWeight}% e exame ${100 - reg.continuousWeight}%.`,
    reg.exemptionGrade != null
      ? `Dispensa de exame com ${reg.exemptionGrade} valores de frequência.`
      : "Sem dispensa de exame.",
    `Admissão a exame com ${reg.examAdmissionGrade} valores; excluído com mais de ${reg.maxAbsencePercentage}% de faltas.`,
    reg.minimumExamGrade != null
      ? `Nota mínima no exame: ${reg.minimumExamGrade} valores.`
      : "Sem nota mínima no exame.",
    `Épocas: ${seasons.join(", ")}${reg.appealSeason && reg.appealMaxUnits ? ` (até ${reg.appealMaxUnits} cadeiras em recurso)` : ""}.`,
    `${reg.creditsPerYear} ECTS por ano, até ${reg.maxCreditsPerYear} com cadeiras em atraso; transita com ${progression} ECTS.`,
    reg.enforcePrerequisites ? "Precedências obrigatórias." : "Precedências só indicativas.",
  ];
}
