/**
 * Domínio de competências (puro).
 *
 * Uma competência está dominada por um aluno quando a média das avaliações
 * ligadas a ela — cada nota convertida para a escala da escola (nota ÷ máximo
 * da avaliação × máximo da escala) — atinge a nota de aprovação do modelo.
 * Sem nenhuma nota nas avaliações ligadas, a competência fica "por avaliar".
 */

export type MasteryItem = { itemId: string; maxScore: number | null };
export type MasteryLink = { itemId: string; competencyId: string };
export type MasteryScore = { itemId: string; enrollmentId: string; score: number | null };

export type CompetencyResult = {
  competencyId: string;
  average: number | null;
  mastered: boolean | null;
};

export type StudentMastery = {
  enrollmentId: string;
  assessed: number;
  mastered: number;
  percentage: number | null;
  competencies: CompetencyResult[];
};

export type CompetencyClassRate = {
  competencyId: string;
  assessedStudents: number;
  masteredStudents: number;
  percentage: number | null;
  linkedItems: number;
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export function normalizeScore(score: number, maxScore: number | null, scaleMax: number) {
  const max = maxScore && maxScore > 0 ? maxScore : scaleMax;
  return (score / max) * scaleMax;
}

export function computeMastery(input: {
  competencyIds: string[];
  enrollmentIds: string[];
  items: MasteryItem[];
  links: MasteryLink[];
  scores: MasteryScore[];
  passing: number;
  scaleMax: number;
}): { students: StudentMastery[]; competencies: CompetencyClassRate[] } {
  const maxByItem = new Map(input.items.map((i) => [i.itemId, i.maxScore]));
  const itemsByCompetency = new Map<string, string[]>();
  for (const link of input.links) {
    if (!maxByItem.has(link.itemId)) continue;
    const list = itemsByCompetency.get(link.competencyId) ?? [];
    list.push(link.itemId);
    itemsByCompetency.set(link.competencyId, list);
  }
  const scoreOf = new Map<string, number>();
  for (const s of input.scores) {
    if (s.score == null || !Number.isFinite(s.score)) continue;
    scoreOf.set(`${s.enrollmentId}:${s.itemId}`, s.score);
  }

  const students = input.enrollmentIds.map((enrollmentId): StudentMastery => {
    const competencies = input.competencyIds.map((competencyId): CompetencyResult => {
      const values = (itemsByCompetency.get(competencyId) ?? [])
        .map((itemId) => {
          const score = scoreOf.get(`${enrollmentId}:${itemId}`);
          return score == null
            ? null
            : normalizeScore(score, maxByItem.get(itemId) ?? null, input.scaleMax);
        })
        .filter((v): v is number => v != null);
      if (!values.length) return { competencyId, average: null, mastered: null };
      const average = round1(values.reduce((a, b) => a + b, 0) / values.length);
      return { competencyId, average, mastered: average >= input.passing };
    });
    const assessed = competencies.filter((c) => c.mastered != null).length;
    const mastered = competencies.filter((c) => c.mastered === true).length;
    return {
      enrollmentId,
      assessed,
      mastered,
      percentage: assessed ? Math.round((mastered / assessed) * 100) : null,
      competencies,
    };
  });

  const competencies = input.competencyIds.map((competencyId): CompetencyClassRate => {
    const results = students
      .map((s) => s.competencies.find((c) => c.competencyId === competencyId))
      .filter((c): c is CompetencyResult => Boolean(c) && c!.mastered != null);
    const masteredStudents = results.filter((c) => c.mastered).length;
    return {
      competencyId,
      assessedStudents: results.length,
      masteredStudents,
      percentage: results.length ? Math.round((masteredStudents / results.length) * 100) : null,
      linkedItems: itemsByCompetency.get(competencyId)?.length ?? 0,
    };
  });

  return { students, competencies };
}
