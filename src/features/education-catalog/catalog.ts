/**
 * Consultas ao catálogo com contexto de nível obrigatório.
 *
 * Toda a sugestão de disciplina pede um contexto (etapa de um país, ou nível
 * ISCED + via). Sem ele, «Física» apareceria a quem configura o 1.º ano do
 * primário. Quando a etapa tem plano curricular, as disciplinas do plano vêm
 * primeiro e marcadas; as restantes do mesmo nível vêm como «outras do nível».
 */
import { COUNTRIES } from "./data/countries";
import {
  COURSE_KIND_ISCED,
  GLOBAL_COURSES,
  globalCourse,
  type CourseKind,
  type GlobalCourse,
} from "./data/courses";
import type { IscedLevel } from "./data/isced";
import { catalogSource, type VerificationStatus } from "./data/sources";
import { EDUCATION_STAGES, stage as findStage, type EducationStage } from "./data/stages";
import {
  GLOBAL_SUBJECTS,
  globalSubject,
  subjectDisplayName,
  SUBJECT_AREA_LABEL,
  SUBJECT_AREA_LEVELS,
  areaFitsLevel,
  type GlobalSubject,
  type SubjectArea,
} from "./data/subjects";
import { searchItems, type MatchKind } from "./search";

export type LevelContext =
  | { stageId: string; course?: string | null; grade?: number | null }
  | { isced: IscedLevel; track: EducationStage["track"]; country?: string | null };

type ResolvedContext = {
  isced: IscedLevel;
  track: EducationStage["track"];
  country: string | null;
  stage: EducationStage | null;
  course: string | null;
  grade: number | null;
};

export class CatalogContextError extends Error {}

function resolve(ctx: LevelContext): ResolvedContext {
  if ("stageId" in ctx) {
    const s = findStage(ctx.stageId);
    if (!s) throw new CatalogContextError(`Etapa de ensino desconhecida: ${ctx.stageId}.`);
    if (ctx.course && !s.courses.includes(ctx.course)) {
      throw new CatalogContextError(
        `O curso ${ctx.course} não existe em «${s.name}» (${s.country}).`,
      );
    }
    if (ctx.grade != null && s.grades.length && !s.grades.includes(ctx.grade)) {
      throw new CatalogContextError(`A classe/ano ${ctx.grade} não pertence a «${s.name}».`);
    }
    return {
      isced: s.isced,
      track: s.track,
      country: s.country,
      stage: s,
      course: ctx.course ?? null,
      grade: ctx.grade ?? null,
    };
  }
  return {
    isced: ctx.isced,
    track: ctx.track,
    country: ctx.country ?? null,
    stage: null,
    course: null,
    grade: null,
  };
}

/** Entradas do plano que se aplicam ao contexto (curso e classe, quando dados). */
function planEntries(c: ResolvedContext) {
  if (!c.stage) return [];
  return c.stage.curriculum.filter(
    (e) =>
      (c.course == null || e.course == null || e.course === c.course) &&
      (c.grade == null || e.grades.includes(c.grade)),
  );
}

export type SubjectSuggestion = {
  subject: GlobalSubject;
  displayName: string;
  /** Do plano curricular da etapa: obrigatória, de opção, ou só do mesmo nível. */
  inPlan: "core" | "optional" | null;
  match?: MatchKind;
  score?: number;
  status: VerificationStatus;
  sourceTitle: string;
};

function fitsLevel(s: GlobalSubject, c: ResolvedContext) {
  return s.levels.includes(c.isced) && s.tracks.includes(c.track);
}

function suggestion(
  s: GlobalSubject,
  c: ResolvedContext,
  core: Set<string>,
  optional: Set<string>,
): SubjectSuggestion {
  const inPlan = core.has(s.code) ? "core" : optional.has(s.code) ? "optional" : null;
  const src = inPlan && c.stage ? catalogSource(c.stage.source) : catalogSource("siga-catalogo");
  return {
    subject: s,
    displayName: subjectDisplayName(s, c.country),
    inPlan,
    status: inPlan && c.stage ? c.stage.status : src.status,
    sourceTitle: src.title,
  };
}

/**
 * Disciplinas para o contexto. Com `planOnly`, só as do plano (vazio se a
 * etapa não tem plano carregado).
 */
export function subjectsForContext(
  ctx: LevelContext,
  options: { planOnly?: boolean; area?: SubjectArea | null } = {},
): SubjectSuggestion[] {
  const c = resolve(ctx);
  if (options.area) {
    assertAreaFits(options.area, c);
    const area = options.area;
    return subjectsForContext(ctx, { planOnly: options.planOnly }).filter(
      (s) => s.subject.area === area,
    );
  }
  const entries = planEntries(c);
  const core = new Set(entries.flatMap((e) => e.core));
  const optional = new Set(
    entries.flatMap((e) => e.optional ?? []).filter((code) => !core.has(code)),
  );
  const planCodes = [...core, ...optional];
  const fromPlan = planCodes.map(globalSubject).filter((s): s is GlobalSubject => Boolean(s));
  const result = fromPlan.map((s) => suggestion(s, c, core, optional));
  if (options.planOnly) return result;
  const rest = GLOBAL_SUBJECTS.filter(
    (s) => !core.has(s.code) && !optional.has(s.code) && fitsLevel(s, c),
  )
    .map((s) => suggestion(s, c, core, optional))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt"));
  return [...result, ...rest];
}

/** Pesquisa de disciplinas dentro do contexto de nível. */
export function searchSubjects(
  query: string,
  ctx: LevelContext,
  limit = 20,
  area?: SubjectArea | null,
): SubjectSuggestion[] {
  const pool = subjectsForContext(ctx, { area });
  const byCode = new Map(pool.map((p) => [p.subject.code, p]));
  // O nome local entra na pesquisa: «Português» encontra Língua Portuguesa em PT.
  const items = pool.map((p) => ({ ...p.subject, aliases: [...p.subject.aliases, p.displayName] }));
  return searchItems(items, query, pool.length)
    .map((r) => {
      const base = byCode.get(r.item.code)!;
      const boost = base.inPlan === "core" ? 6 : base.inPlan === "optional" ? 3 : 0;
      return { ...base, match: r.kind, score: r.score + boost };
    })
    .sort((a, b) => b.score! - a.score! || a.displayName.localeCompare(b.displayName, "pt"))
    .slice(0, limit);
}

function contextLabel(c: ResolvedContext) {
  return c.stage
    ? `«${c.stage.name}${c.stage.cycle ? ` — ${c.stage.cycle}` : ""}»`
    : `o nível ISCED ${c.isced} (${TRACK_LABEL[c.track].toLowerCase()})`;
}

/**
 * Áreas de formação que existem no contexto de nível, com quantas disciplinas
 * cada uma tem nele. O primário não tem nenhuma; o técnico-profissional tem as
 * técnicas; o superior tem todas.
 */
export function areasForContext(ctx: LevelContext) {
  const c = resolve(ctx);
  return (Object.keys(SUBJECT_AREA_LEVELS) as SubjectArea[])
    .filter((area) => areaFitsLevel(area, c.isced, c.track))
    .map((area) => ({
      area,
      label: SUBJECT_AREA_LABEL[area],
      subjects: GLOBAL_SUBJECTS.filter((s) => s.area === area && fitsLevel(s, c)).length,
    }))
    .filter((a) => a.subjects > 0);
}

function assertAreaFits(area: SubjectArea, c: ResolvedContext) {
  if (areaFitsLevel(area, c.isced, c.track)) return;
  const rule = SUBJECT_AREA_LEVELS[area];
  const from = Math.min(...rule.levels);
  const vias = rule.tracks.map((t) => TRACK_LABEL[t].toLowerCase()).join(", ");
  throw new CatalogContextError(
    `A área ${SUBJECT_AREA_LABEL[area]} não existe em ${contextLabel(c)}: ` +
      `começa no nível ISCED ${from} (${vias}).`,
  );
}

/** Uma área cabe no contexto? Devolve o motivo quando não cabe. */
export function validateAreaContext(
  area: SubjectArea,
  ctx: LevelContext,
): { ok: true } | { ok: false; reason: string } {
  try {
    assertAreaFits(area, resolve(ctx));
    return { ok: true };
  } catch (error) {
    if (error instanceof CatalogContextError) return { ok: false, reason: error.message };
    throw error;
  }
}

/** Uma disciplina cabe no contexto? Devolve o motivo quando não cabe. */
export function validateSubjectContext(
  code: string,
  ctx: LevelContext,
): { ok: true } | { ok: false; reason: string } {
  const s = globalSubject(code);
  if (!s) return { ok: false, reason: `Disciplina desconhecida no catálogo: ${code}.` };
  const c = resolve(ctx);
  if (!s.levels.includes(c.isced)) {
    const where = c.stage
      ? `«${c.stage.name}${c.stage.cycle ? ` — ${c.stage.cycle}` : ""}»`
      : `o nível ISCED ${c.isced}`;
    return { ok: false, reason: `${s.name} não é uma disciplina de ${where}.` };
  }
  if (!s.tracks.includes(c.track)) {
    return {
      ok: false,
      reason: `${s.name} não pertence à via ${TRACK_LABEL[c.track].toLowerCase()}.`,
    };
  }
  return { ok: true };
}

export const TRACK_LABEL: Record<EducationStage["track"], string> = {
  general: "Ensino geral",
  technical: "Técnico-profissional",
  higher: "Ensino superior",
};

export type CourseSuggestion = {
  course: GlobalCourse;
  isced: IscedLevel;
  /** Etapas (de países) onde o curso está ligado a um plano ou oferta. */
  stages: string[];
  match?: MatchKind;
  score?: number;
};

export type CourseFilter = {
  country?: string | null;
  stageId?: string | null;
  kind?: CourseKind | null;
  isced?: IscedLevel | null;
};

function stagesOfCourse(code: string) {
  return EDUCATION_STAGES.filter((s) => s.courses.includes(code)).map((s) => s.id);
}

export function coursesFor(filter: CourseFilter = {}): CourseSuggestion[] {
  const st = filter.stageId ? findStage(filter.stageId) : null;
  if (filter.stageId && !st)
    throw new CatalogContextError(`Etapa de ensino desconhecida: ${filter.stageId}.`);
  return GLOBAL_COURSES.filter((c) => {
    if (st && !st.courses.includes(c.code)) return false;
    if (filter.kind && c.kind !== filter.kind) return false;
    if (filter.isced != null && COURSE_KIND_ISCED[c.kind] !== filter.isced) return false;
    if (filter.country && !st) {
      const country = filter.country.toUpperCase();
      // Num país com etapas carregadas, só os cursos ligados a uma etapa dele.
      const loaded = EDUCATION_STAGES.some((s) => s.country === country);
      if (
        loaded &&
        !EDUCATION_STAGES.some((s) => s.country === country && s.courses.includes(c.code))
      )
        return false;
    }
    return true;
  }).map((course) => ({
    course,
    isced: COURSE_KIND_ISCED[course.kind],
    stages: stagesOfCourse(course.code),
  }));
}

export function searchCourses(
  query: string,
  filter: CourseFilter = {},
  limit = 20,
): CourseSuggestion[] {
  const pool = coursesFor(filter);
  const byCode = new Map(pool.map((p) => [p.course.code, p]));
  return searchItems(
    pool.map((p) => p.course),
    query,
    limit,
  ).map((r) => ({ ...byCode.get(r.item.code)!, match: r.kind, score: r.score }));
}

export { globalCourse, globalSubject };

// ── Cobertura real ────────────────────────────────────────────────────────

export type CountryCoverage = {
  country: string;
  name: string;
  stages: number;
  grades: number;
  stagesWithPlan: number;
  planEntries: number;
  subjectsInPlans: number;
  courses: number;
  byStatus: Partial<Record<VerificationStatus, number>>;
};

/** O que está mesmo carregado por país — para não prometer mais do que há. */
export function catalogCoverage(): CountryCoverage[] {
  return COUNTRIES.map((c) => {
    const stages = EDUCATION_STAGES.filter((s) => s.country === c.code);
    const byStatus: CountryCoverage["byStatus"] = {};
    for (const s of stages) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    return {
      country: c.code,
      name: c.name,
      stages: stages.length,
      grades: stages.reduce((n, s) => n + s.grades.length, 0),
      stagesWithPlan: stages.filter((s) => s.curriculum.length > 0).length,
      planEntries: stages.reduce((n, s) => n + s.curriculum.length, 0),
      subjectsInPlans: new Set(
        stages.flatMap((s) => s.curriculum.flatMap((e) => [...e.core, ...(e.optional ?? [])])),
      ).size,
      courses: new Set(stages.flatMap((s) => s.courses)).size,
      byStatus,
    };
  });
}
