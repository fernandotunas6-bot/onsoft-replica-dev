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
    match: /prim[aá]r|1[ªa]|2[ªa]|3[ªa]|4[ªa]|5[ªa]|6[ªa]/i,
  },
  {
    id: "i_ciclo",
    label: "I Ciclo do Ensino Secundário (7ª–9ª)",
    cycle: "I Ciclo",
    classes: ["7ª", "8ª", "9ª"],
    match: /i\s*ciclo|7[ªa]|8[ªa]|9[ªa]|primeiro ciclo/i,
  },
  {
    id: "ii_ciclo",
    label: "II Ciclo / Ensino Médio (10ª–13ª)",
    cycle: "II Ciclo",
    classes: ["10ª", "11ª", "12ª", "13ª"],
    match: /ii\s*ciclo|m[eé]dio|10[ªa]|11[ªa]|12[ªa]|13[ªa]/i,
  },
] as const;

export type AngolaTeachingLevelId = (typeof angolaTeachingLevels)[number]["id"];

export const angolaSecondaryCourses = [
  { id: "cfb", label: "Ciências Físicas e Biológicas", short: "CFB" },
  { id: "cej", label: "Ciências Económico-Jurídicas", short: "CEJ" },
  { id: "letras", label: "Letras", short: "Letras" },
  { id: "tecnico", label: "Técnico-Profissional", short: "Técnico" },
] as const;

export type AngolaCourseId = (typeof angolaSecondaryCourses)[number]["id"];

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

export function scoreAverage(mac: number, npp: number, npt: number) {
  return (mac + npp + npt) / 3;
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

export function gradeMatchesTeachingLevels(
  gradeName: string,
  enabled: readonly string[],
) {
  if (!enabled.length) return true;
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

export function parsePautaScore(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed || trimmed === "—") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return Number.NaN;
  if (parsed < 0 || parsed > 20) return Number.NaN;
  return parsed;
}
