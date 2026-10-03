/** Estrutura lectiva angolana (MINED) usada em pautas e nas configurações pedagógicas. */

export const angolaTeachingLevels = [
  {
    id: "pre_escolar",
    label: "Iniciação / Pré-escolar",
    cycle: "Pré-escolar",
    classes: ["Iniciação"],
    match: /inicia|pr[eé]-?escol/i,
  },
  {
    id: "primario",
    label: "Ensino Primário (1ª–6ª)",
    cycle: "Primário",
    classes: ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª"],
    // Aceita "1ª"/"1.ª"/"1a" — os dados reais das turmas usam o formato com ponto ("1.ª Classe").
    // `(?<!\d)`: sem ele, «11ª» e «12ª» (II Ciclo) contavam como «1ª»/«2ª» do primário
    // nas pautas e no histórico, que pegam no primeiro nível que coincide.
    match: /prim[aá]r|(?<!\d)[123456]\.?\s?[ªa]/i,
  },
  {
    id: "i_ciclo",
    label: "I Ciclo do Ensino Secundário (7ª–9ª)",
    cycle: "I Ciclo",
    classes: ["7ª", "8ª", "9ª"],
    match: /(?<!i)i\s*ciclo|(?<!\d)[789]\.?\s?[ªa]|primeiro ciclo/i,
  },
  {
    id: "ii_ciclo",
    label: "II Ciclo / Ensino Médio (10ª–13ª)",
    cycle: "II Ciclo",
    classes: ["10ª", "11ª", "12ª", "13ª"],
    match: /ii\s*ciclo|m[eé]dio|1[0123]\.?\s?[ªa]/i,
  },
  {
    id: "superior",
    label: "Ensino Superior (1º–5º Ano)",
    cycle: "Superior",
    classes: ["1º Ano", "2º Ano", "3º Ano", "4º Ano", "5º Ano"],
    // Ordinal masculino "º" (Ano) em vez do feminino "ª" (Classe) usado no ensino geral — não colide
    // com os matchers de primario/i_ciclo/ii_ciclo acima.
    match: /superior|licenciatura|mestrado|\d\.?\s?º\s?ano/i,
  },
] as const;

export type AngolaTeachingLevelId = (typeof angolaTeachingLevels)[number]["id"];

export function isTeachingLevelId(value: unknown): value is AngolaTeachingLevelId {
  return angolaTeachingLevels.some((level) => level.id === value);
}

/** Mesmos ciclos usados pelo motor de avaliação e pelas pautas (assessment-engine.ts, pautas/types.ts). */
export type AngolaTeachingCycle =
  "primario" | "i_ciclo" | "ii_ciclo" | "tecnico" | "adultos" | "superior";

/** «1º Ano», «2.º ano · DIREITO»: ano curricular do Ensino Superior. */
const HIGHER_ED_YEAR = /^\s*\d\.?\s?º\s?ano\b/i;

/**
 * Deriva o ciclo de ensino a partir da classe/curso reais de uma turma — fonte única usada tanto
 * pelas Pautas (PautasWorkspaceModule.tsx) como pelo Histórico académico (academic/server.ts) para
 * nunca inferir ciclos diferentes para os mesmos dados.
 */
export function inferTeachingCycle(
  gradeName?: string | null,
  courseName?: string | null,
): AngolaTeachingCycle {
  const course = (courseName ?? "").toLowerCase();
  if (course.includes("técnic") || course.includes("tecnic")) return "tecnico";
  // «Nº Ano» é sempre Superior, mesmo que o código do curso a seguir contenha
  // palavras de outro nível (ex.: «1º Ano · EDUC-PRIMARIA», «2º Ano · ENSINO-MEDIO»).
  if (HIGHER_ED_YEAR.test(gradeName ?? "")) return "superior";
  const level = angolaTeachingLevels.find((lvl) => lvl.match.test(gradeName ?? ""));
  if (!level) return "i_ciclo";
  return level.id === "pre_escolar" ? "primario" : level.id;
}

export const angolaSecondaryCourses = [
  { id: "cfb", label: "Ciências Físicas e Biológicas", short: "CFB" },
  { id: "cej", label: "Ciências Económico-Jurídicas", short: "CEJ" },
  { id: "letras", label: "Letras", short: "Letras" },
  { id: "tecnico", label: "Técnico-Profissional", short: "Técnico" },
] as const;

export type AngolaCourseId = (typeof angolaSecondaryCourses)[number]["id"];

export function isCourseId(value: unknown): value is AngolaCourseId {
  return angolaSecondaryCourses.some((course) => course.id === value);
}

export const angolaCoreSubjects: ReadonlyArray<{
  code: string;
  name: string;
  levels: readonly AngolaTeachingLevelId[];
}> = [
  { code: "LP", name: "Língua Portuguesa", levels: ["primario", "i_ciclo", "ii_ciclo"] },
  { code: "MAT", name: "Matemática", levels: ["primario", "i_ciclo", "ii_ciclo"] },
  { code: "EF", name: "Educação Física", levels: ["primario", "i_ciclo", "ii_ciclo"] },
  { code: "EM", name: "Educação Moral e Cívica", levels: ["primario", "i_ciclo"] },
  { code: "CN", name: "Estudo do Meio / Ciências da Natureza", levels: ["primario"] },
  { code: "HIST", name: "História", levels: ["i_ciclo", "ii_ciclo"] },
  { code: "GEO", name: "Geografia", levels: ["i_ciclo", "ii_ciclo"] },
  { code: "ING", name: "Inglês", levels: ["i_ciclo", "ii_ciclo"] },
  { code: "FIS", name: "Física", levels: ["ii_ciclo"] },
  { code: "QUI", name: "Química", levels: ["ii_ciclo"] },
  { code: "BIO", name: "Biologia", levels: ["ii_ciclo"] },
  { code: "FIL", name: "Filosofia", levels: ["ii_ciclo"] },
] as const;

export const angolaGradeScale = {
  min: 0,
  max: 20,
  passing: 10,
  components: [
    { code: "MAC", label: "Média de Avaliação Contínua" },
    { code: "NPP", label: "Nota da Prova do Professor" },
    { code: "NPT", label: "Nota da Prova Trimestral" },
  ],
} as const;

/**
 * Arredonda à décima. O `Number.EPSILON` está aqui porque `Math.round(x * 10) / 10` sozinho
 * erra em valores como 10.45, que em binário fica ligeiramente abaixo e desce para 10.4.
 *
 * Existe como função e não inline porque a mesma linha estava copiada em três cálculos deste
 * ficheiro, e o motor de avaliação precisa dela para as médias que calcula por fora.
 */
export function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/**
 * Fonte única de cálculo de médias (Decreto Executivo n.º 424/25). Usada tanto pelo motor de
 * avaliação (`assessment-engine.ts`) como pelas pautas (`pautas/assessment.ts`) — não duplicar
 * esta fórmula noutro sítio.
 */
export function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 20) return null;
  return roundToOneDecimal(num);
}

/**
 * Média Trimestral (MT) = (MACT + NPT) / 2. Se um dos dois faltar, degrada temporariamente para
 * o valor disponível (útil durante o lançamento de notas, antes de a pauta fechar); a NPP não
 * participa deste cálculo — é só exibida por compatibilidade visual com modelos anteriores.
 */
export function calculateTrimesterAverage(
  mac: number | null | undefined,
  npt: number | null | undefined,
  npp?: number | null | undefined,
): number | null {
  const normMac = normalizeScore(mac);
  const normNpt = normalizeScore(npt);
  const normNpp = normalizeScore(npp);

  // Decreto 424/25: MT = (MACT + NPT) / 2. A NPP já entra na MACT.
  if (normMac !== null && normNpt !== null) {
    return roundToOneDecimal((normMac + normNpt) / 2);
  }
  if (normMac !== null) return normMac;
  if (normNpt !== null) return normNpt;
  return null;
}

/** Média Final da Disciplina (MFD) = (MT1 + MT2 + MT3) / 3, com média parcial dos trimestres disponíveis. */
export function calculateDisciplineFinalAverage(
  mt1: number | null | undefined,
  mt2: number | null | undefined,
  mt3: number | null | undefined,
): number | null {
  const v1 = normalizeScore(mt1);
  const v2 = normalizeScore(mt2);
  const v3 = normalizeScore(mt3);
  const valid = [v1, v2, v3].filter((x): x is number => x !== null);
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  return roundToOneDecimal(sum / valid.length);
}

export function scoreAverage(mac: number, npp: number, npt: number) {
  return calculateTrimesterAverage(mac, npt, npp) ?? 0;
}

export function situacaoPauta(average: number, passing: number = angolaGradeScale.passing) {
  if (!Number.isFinite(average)) return { label: "—", tone: "muted" as const };
  return average >= passing
    ? { label: "Transita", tone: "success" as const }
    : { label: "Não transita", tone: "danger" as const };
}

export function initialsFromName(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Número de períodos lectivos por ciclo — 3 trimestres nos ciclos angolanos já suportados, 2
 * semestres no Ensino Superior. Fonte única usada pelas Pautas (mini/trimestre/final) e pelo
 * motor de avaliação para nunca assumir "3" fixo num sítio e "2" configurável noutro.
 */
export const CYCLE_PERIOD_COUNT: Record<AngolaTeachingCycle, 2 | 3> = {
  primario: 3,
  i_ciclo: 3,
  ii_ciclo: 3,
  tecnico: 3,
  adultos: 3,
  superior: 2,
};

/** Ciclos em regime semestral — o nome do período vem daqui, nunca da contagem. */
const SEMESTER_CYCLES: ReadonlySet<AngolaTeachingCycle> = new Set<AngolaTeachingCycle>([
  "superior",
]);

export const MIN_EVALUATION_PERIODS = 2;
export const MAX_EVALUATION_PERIODS = 3;

/** Devolve a contagem configurada pela escola, ou null se estiver fora do suportado. */
export function normalizeEvaluationPeriods(value: unknown): 2 | 3 | null {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return null;
  if (parsed < MIN_EVALUATION_PERIODS || parsed > MAX_EVALUATION_PERIODS) return null;
  return parsed as 2 | 3;
}

/**
 * Contagem de períodos: manda o que a escola configurou; o ciclo é só a omissão.
 *
 * O Ensino Superior é a excepção — tem regime semestral próprio, por isso a
 * contagem trimestral da escola não se lhe aplica. Numa escola que tenha os dois
 * regimes, um único número não poderia servir ambos.
 */
export function getPeriodCountForCycle(
  cycle?: AngolaTeachingCycle | null,
  configuredCount?: unknown,
): 2 | 3 {
  const cycleDefault = cycle ? CYCLE_PERIOD_COUNT[cycle] : 3;
  if (cycle && SEMESTER_CYCLES.has(cycle)) return cycleDefault;
  return normalizeEvaluationPeriods(configuredCount) ?? cycleDefault;
}

/** [1,2,3] ou [1,2], consoante a configuração da escola e o ciclo. */
export function getPeriodsForCycle(
  cycle?: AngolaTeachingCycle | null,
  configuredCount?: unknown,
): Array<1 | 2 | 3> {
  return getPeriodCountForCycle(cycle, configuredCount) === 2 ? [1, 2] : [1, 2, 3];
}

/**
 * "Trimestre" ou "Semestre" — decidido pelo ciclo, e não pela contagem. Derivar
 * do número faria uma escola que escolhesse 2 trimestres passar a dizer
 * "Semestre" em todo o lado.
 */
export function getPeriodNoun(cycle?: AngolaTeachingCycle | null): "Trimestre" | "Semestre" {
  return cycle && SEMESTER_CYCLES.has(cycle) ? "Semestre" : "Trimestre";
}

/** Ex.: "1º Trimestre" / "1º Semestre". */
export function getPeriodLabel(
  cycle: AngolaTeachingCycle | null | undefined,
  period: number,
): string {
  return `${period}º ${getPeriodNoun(cycle)}`;
}

const romanPeriod = ["", "I", "II", "III"] as const;

/** Ex.: "I TRIMESTRE" / "I SEMESTRE" — usado nos cabeçalhos das pautas impressas. */
export function getPeriodLabelUpper(
  cycle: AngolaTeachingCycle | null | undefined,
  period: number,
): string {
  const roman = romanPeriod[period] ?? String(period);
  return `${roman} ${getPeriodNoun(cycle).toUpperCase()}`;
}

export function gradeMatchesTeachingLevels(gradeName: string, enabled: readonly string[]) {
  if (!enabled.length) return true;
  if (HIGHER_ED_YEAR.test(gradeName)) return enabled.includes("superior");
  return angolaTeachingLevels.some(
    (level) => enabled.includes(level.id) && level.match.test(gradeName),
  );
}

export function subjectShortCode(name: string, code?: string | null) {
  const trimmed = code?.trim();
  if (trimmed) return trimmed.slice(0, 6).toUpperCase();
  const catalog = angolaCoreSubjects.find(
    (subject) => subject.name.toLowerCase() === name.trim().toLowerCase(),
  );
  if (catalog) return catalog.code;
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 4) || "DISC"
  );
}

export function annualAverage(terms: Array<number | null | undefined>) {
  const values = terms.filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatScore(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export const assessmentKinds = [
  { id: "teste", label: "Teste" },
  { id: "prova", label: "Prova" },
  { id: "trabalho", label: "Trabalho" },
  { id: "participacao", label: "Participação" },
  { id: "oral", label: "Oral" },
  { id: "projecto", label: "Projecto" },
  { id: "continua", label: "Avaliação contínua" },
  { id: "recuperacao", label: "Recuperação" },
  { id: "exame", label: "Exame" },
  { id: "exame_recurso", label: "Exame de recurso" },
  { id: "outra", label: "Outra" },
] as const;

export type AssessmentKindId = (typeof assessmentKinds)[number]["id"];

export const assessmentComponents = [
  { id: "MAC", label: "MAC · Avaliação contínua" },
  { id: "NPP", label: "NPP · Prova do professor" },
  { id: "NPT", label: "NPT · Prova trimestral" },
  { id: "recurso", label: "Recurso" },
  { id: "exame", label: "Exame" },
] as const;

export type AssessmentComponentId = (typeof assessmentComponents)[number]["id"];

/** Para que serve a prova: diagnosticar, acompanhar ou classificar. */
export const assessmentPurposes = [
  { id: "diagnostic", label: "Diagnóstica" },
  { id: "formative", label: "Formativa" },
  { id: "summative", label: "Sumativa" },
] as const;

export type AssessmentPurposeId = (typeof assessmentPurposes)[number]["id"];

export const pautaSituations = [
  { id: "todos", label: "Todos" },
  { id: "pendente", label: "Pendente" },
  { id: "completo", label: "Completo" },
  { id: "transita", label: "Transita" },
  { id: "nao_transita", label: "Não transita" },
  { id: "admitido", label: "Admitido" },
  { id: "nao_admitido", label: "Não admitido" },
  { id: "aprovado", label: "Aprovado" },
  { id: "reprovado", label: "Reprovado" },
  { id: "em_recurso", label: "Em recurso" },
] as const;

export function componentAverage(scores: Array<number | null | undefined>) {
  return annualAverage(scores);
}

export function recursoFinal(original: number | null, recurso: number | null) {
  if (original == null) return recurso;
  if (recurso == null) return original;
  return (original + recurso) / 2;
}

/**
 * Nota escrita numa célula da pauta. A escala vem do modelo de avaliação
 * activo; 0–20 só quando a escola ainda não tem modelo.
 */
export function parsePautaScore(
  value: string,
  scale: { minimum: number; maximum: number } = { minimum: 0, maximum: 20 },
) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed || trimmed === "—") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return Number.NaN;
  if (parsed < scale.minimum || parsed > scale.maximum) return Number.NaN;
  return parsed;
}
