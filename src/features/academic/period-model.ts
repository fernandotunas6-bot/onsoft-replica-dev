/**
 * Como a escola divide o ano lectivo: trimestres (ensino geral, 3) ou
 * semestres (Ensino Superior, 2). Uma escola só de Ensino Superior trabalha por
 * semestres; uma escola com outros níveis mantém os trimestres (as pautas do
 * geral — MAC/NPP/NPT — são trimestrais).
 */
export type PeriodModel = {
  kind: "trimestre" | "semestre";
  count: 2 | 3;
  /** «Trimestres» / «Semestres» */
  plural: string;
};

export function isHigherEdOnly(teachingLevels: readonly string[]) {
  return teachingLevels.length > 0 && teachingLevels.every((level) => level === "superior");
}

export function periodModelFor(teachingLevels: readonly string[]): PeriodModel {
  return isHigherEdOnly(teachingLevels)
    ? { kind: "semestre", count: 2, plural: "Semestres" }
    : { kind: "trimestre", count: 3, plural: "Trimestres" };
}

const DAY = 86_400_000;
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Dois semestres seguidos que cobrem o ano lectivo — sugestão, a escola acerta as datas. */
export function suggestSemesters(yearStartsOn: string, yearEndsOn: string) {
  const start = Date.parse(`${yearStartsOn}T00:00:00Z`);
  const end = Date.parse(`${yearEndsOn}T00:00:00Z`);
  const days = Math.max(1, Math.round((end - start) / DAY));
  const cut = start + Math.floor(days / 2) * DAY;
  return [
    { sequence: 1, name: "1º Semestre", startsOn: toIso(start), endsOn: toIso(cut) },
    { sequence: 2, name: "2º Semestre", startsOn: toIso(cut + DAY), endsOn: toIso(end) },
  ];
}
