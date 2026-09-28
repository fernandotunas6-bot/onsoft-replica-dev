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

export const REGULATION_PRESET_IDS = [
  "angola",
  "bolonha",
  "brasil",
  "eua",
  "personalizado",
] as const;
export type RegulationPresetId = (typeof REGULATION_PRESET_IDS)[number];

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
    /** Modelo de referência de onde partiu (só informativo; tudo continua editável). */
    presetId: z.enum(REGULATION_PRESET_IDS).default("angola"),
    /**
     * Escala em que as notas se lançam e se mostram. Por dentro tudo é 0–20;
     * 10 e 100 convertem-se (5/10 = 10/20; 60% = 12/20).
     */
    displayScale: z.union([z.literal(20), z.literal(10), z.literal(100)]).default(20),
    /** Nome da unidade de crédito nos ecrãs e documentos. */
    creditLabel: z.enum(["créditos", "ECTS", "UC"]).default("créditos"),
    /** Máximo de inscrições na mesma cadeira (prescrição). `null`: sem limite. */
    maxAttemptsPerUnit: z.number().int().min(1).max(20).nullable().default(null),
    /** Classificação final do curso: menções qualitativas, honras latinas ou nenhuma. */
    finalMentions: z.enum(["qualitativa", "latinas", "nenhuma"]).default("qualitativa"),
    /** Mostrar a nota ECTS (A–F) e o equivalente GPA 0–4 ao lado da nota. */
    showEctsGrade: z.boolean().default(false),
    showGpa: z.boolean().default(false),
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
  // Compara-se a nota já arredondada: com nota inteira, 9,5 conta como 10.
  const shown = round(continuous, reg.finalGradeDecimals);
  if (shown < reg.examAdmissionGrade) {
    return {
      status: "excluido_frequencia",
      finalGrade: round(continuous, reg.finalGradeDecimals),
      season: "frequencia",
    };
  }
  if (reg.exemptionGrade != null && shown >= reg.exemptionGrade) {
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

/** Nota interna (0–20) na escala do regulamento, arredondada para mostrar. */
export function toDisplayGrade(reg: HigherEdRegulation, grade20: number) {
  const value = (grade20 * reg.displayScale) / 20;
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/** Nota lançada na escala do regulamento → 0–20 interno. */
export function fromDisplayGrade(reg: HigherEdRegulation, value: number) {
  return Math.round(((value * 20) / reg.displayScale + Number.EPSILON) * 100) / 100;
}

/** "valores", "pontos" ou "%" consoante a escala. */
export function gradeUnitLabel(reg: HigherEdRegulation) {
  return reg.displayScale === 100 ? "%" : reg.displayScale === 10 ? "pontos" : "valores";
}

export function formatGrade(reg: HigherEdRegulation, grade20: number) {
  const value = toDisplayGrade(reg, grade20).toLocaleString("pt-PT");
  return reg.displayScale === 100 ? `${value}%` : `${value} ${gradeUnitLabel(reg)}`;
}

/**
 * Nota ECTS de uma aprovação, pela tabela fixa usada nos suplementos ao
 * diploma com a escala 0–20: A 18–20, B 16–17, C 14–15, D 12–13, E 10–11.
 */
export function ectsGrade(
  reg: HigherEdRegulation,
  grade20: number,
): "A" | "B" | "C" | "D" | "E" | "F" {
  if (grade20 < reg.passingGrade) return "F";
  if (grade20 >= 18) return "A";
  if (grade20 >= 16) return "B";
  if (grade20 >= 14) return "C";
  if (grade20 >= 12) return "D";
  return "E";
}

/**
 * Pontos GPA 0–4. Com honras latinas (modelo americano) usa as bandas
 * percentuais A 90, B 80, C 70, D 60; nos outros, as bandas 0–20 do motor.
 */
export function gpaPoints(reg: HigherEdRegulation, grade20: number): number {
  const percent = grade20 * 5;
  const bands: Array<[number, number]> =
    reg.finalMentions === "latinas"
      ? [
          [90, 4],
          [80, 3],
          [70, 2],
          [60, 1],
        ]
      : [
          [90, 4],
          [80, 3],
          [70, 2],
          [reg.passingGrade * 5, 1],
        ];
  for (const [min, points] of bands) if (percent >= min) return points;
  return 0;
}

/** Menção da classificação final do curso (média 0–20, ou GPA com honras latinas). */
export function finalMention(
  reg: HigherEdRegulation,
  average20: number | null,
  gpa: number | null,
): string | null {
  if (reg.finalMentions === "nenhuma") return null;
  if (reg.finalMentions === "latinas") {
    if (gpa == null) return null;
    if (gpa >= 3.9) return "Summa cum laude";
    if (gpa >= 3.7) return "Magna cum laude";
    if (gpa >= 3.5) return "Cum laude";
    return null;
  }
  if (average20 == null || average20 < reg.passingGrade) return null;
  const rounded = Math.round(average20);
  if (rounded >= 18) return "Excelente";
  if (rounded >= 16) return "Muito Bom";
  if (rounded >= 14) return "Bom";
  return "Suficiente";
}

type PresetValues = Omit<HigherEdRegulation, "presetId">;

/**
 * Modelos de referência. São pontos de partida com os valores mais comuns em
 * cada sistema, não a lei de nenhuma instituição: cada uma ajusta ao seu
 * regulamento aprovado.
 */
export const REGULATION_PRESETS: Record<
  Exclude<RegulationPresetId, "personalizado">,
  { label: string; detail: string; values: PresetValues }
> = {
  angola: {
    label: "Angola",
    detail: "0–20, aprovação a 10, dispensa a 14, épocas normal, recurso e especial",
    values: {
      passingGrade: 10,
      continuousWeight: 40,
      exemptionGrade: 14,
      examAdmissionGrade: 7,
      maxAbsencePercentage: 33,
      minimumExamGrade: null,
      appealSeason: true,
      specialSeason: true,
      appealMaxUnits: null,
      gradeImprovement: true,
      creditsPerYear: 60,
      maxCreditsPerYear: 75,
      progressionPercentage: 75,
      enforcePrerequisites: true,
      finalGradeDecimals: 0,
      displayScale: 20,
      creditLabel: "créditos",
      maxAttemptsPerUnit: null,
      finalMentions: "qualitativa",
      showEctsGrade: false,
      showGpa: false,
    },
  },
  bolonha: {
    label: "Europa · Bolonha",
    detail: "0–20 e ECTS, aprovação a 9,5 (arredonda a 10), nota ECTS A–F",
    values: {
      passingGrade: 10,
      continuousWeight: 50,
      exemptionGrade: 10,
      examAdmissionGrade: 0,
      maxAbsencePercentage: 25,
      minimumExamGrade: null,
      appealSeason: true,
      specialSeason: true,
      appealMaxUnits: null,
      gradeImprovement: true,
      creditsPerYear: 60,
      maxCreditsPerYear: 84,
      progressionPercentage: 50,
      enforcePrerequisites: false,
      finalGradeDecimals: 0,
      displayScale: 20,
      creditLabel: "ECTS",
      maxAttemptsPerUnit: null,
      finalMentions: "qualitativa",
      showEctsGrade: true,
      showGpa: false,
    },
  },
  brasil: {
    label: "Brasil",
    detail: "0–10, aprovação directa com 7, exame final com média 5, 75% de presença",
    values: {
      passingGrade: 10,
      continuousWeight: 50,
      exemptionGrade: 14,
      examAdmissionGrade: 8,
      maxAbsencePercentage: 25,
      minimumExamGrade: null,
      appealSeason: false,
      specialSeason: false,
      appealMaxUnits: null,
      gradeImprovement: false,
      creditsPerYear: 60,
      maxCreditsPerYear: 80,
      progressionPercentage: 0,
      enforcePrerequisites: true,
      finalGradeDecimals: 1,
      displayScale: 10,
      creditLabel: "créditos",
      maxAttemptsPerUnit: null,
      finalMentions: "nenhuma",
      showEctsGrade: false,
      showGpa: false,
    },
  },
  eua: {
    label: "Estados Unidos",
    detail: "0–100%, aprovação a 60%, GPA 0–4, 30 créditos por ano, honras latinas",
    values: {
      passingGrade: 12,
      continuousWeight: 60,
      exemptionGrade: null,
      examAdmissionGrade: 0,
      maxAbsencePercentage: 20,
      minimumExamGrade: null,
      appealSeason: false,
      specialSeason: false,
      appealMaxUnits: null,
      gradeImprovement: true,
      creditsPerYear: 30,
      maxCreditsPerYear: 36,
      progressionPercentage: 80,
      enforcePrerequisites: true,
      finalGradeDecimals: 0,
      displayScale: 100,
      creditLabel: "créditos",
      maxAttemptsPerUnit: 3,
      finalMentions: "latinas",
      showEctsGrade: false,
      showGpa: true,
    },
  },
};

export function applyRegulationPreset(
  id: Exclude<RegulationPresetId, "personalizado">,
): HigherEdRegulation {
  return higherEdRegulationSchema.parse({ ...REGULATION_PRESETS[id].values, presetId: id });
}

/** O regulamento em frases curtas, para o resumo no ecrã e nos documentos. */
export function describeHigherEdRegulation(reg: HigherEdRegulation): string[] {
  const g = (grade20: number) => formatGrade(reg, grade20);
  const credits = reg.creditLabel;
  const seasons = [
    "normal",
    reg.appealSeason ? "recurso" : null,
    reg.specialSeason ? "especial" : null,
  ].filter(Boolean);
  const progression = yearProgression(reg, 0).required;
  const extras = [
    reg.showEctsGrade ? "nota ECTS (A–F)" : null,
    reg.showGpa ? "equivalente GPA 0–4" : null,
  ].filter(Boolean);
  return [
    `Aprovação com ${g(reg.passingGrade)}; nota final ${reg.finalGradeDecimals ? "com uma casa decimal" : "inteira"}.`,
    `Frequência ${reg.continuousWeight}% e exame ${100 - reg.continuousWeight}%.`,
    reg.exemptionGrade != null
      ? `Dispensa de exame com ${g(reg.exemptionGrade)} de frequência.`
      : "Sem dispensa de exame.",
    `${reg.examAdmissionGrade > 0 ? `Admissão a exame com ${g(reg.examAdmissionGrade)}; e` : "E"}xcluído com mais de ${reg.maxAbsencePercentage}% de faltas.`,
    reg.minimumExamGrade != null
      ? `Nota mínima no exame: ${g(reg.minimumExamGrade)}.`
      : "Sem nota mínima no exame.",
    `Épocas: ${seasons.join(", ")}${reg.appealSeason && reg.appealMaxUnits ? ` (até ${reg.appealMaxUnits} cadeiras em recurso)` : ""}${reg.gradeImprovement ? "; melhoria de nota" : ""}.`,
    `${reg.creditsPerYear} ${credits} por ano, até ${reg.maxCreditsPerYear} com cadeiras em atraso; ${progression ? `transita com ${progression} ${credits}` : "sem retenção por ano"}.`,
    [
      reg.enforcePrerequisites ? "Precedências obrigatórias" : "Precedências só indicativas",
      reg.maxAttemptsPerUnit ? `até ${reg.maxAttemptsPerUnit} inscrições por cadeira` : null,
    ]
      .filter(Boolean)
      .join("; ") + ".",
    reg.finalMentions === "qualitativa"
      ? "Classificação final: Suficiente, Bom, Muito Bom, Excelente."
      : reg.finalMentions === "latinas"
        ? "Classificação final com honras latinas pelo GPA."
        : "Classificação final só com a média.",
    ...(extras.length ? [`Mostra ${extras.join(" e ")}.`] : []),
  ];
}
