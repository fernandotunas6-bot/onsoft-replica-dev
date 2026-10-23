/**
 * Pesquisa do catálogo por HTTP, para quem não corre o código do SIGA: Mobile
 * V4, WEB (assistente de criação de escola), integrações. A mesma lógica e os
 * mesmos dados do SIGA — nenhum outro sítio mantém um catálogo próprio.
 *
 * GET /api/saas/education-catalog/search
 *   type=subjects&stage=AO-ESG2[&course=SEC-CFB][&grade=10][&q=mat]
 *   type=subjects&isced=6&track=higher[&country=PT][&q=…]
 *   type=subjects&stage=AO-ETP&area=saude   (área só dentro do nível)
 *   type=areas&stage=AO-ETP                 (áreas que existem nesse nível)
 *   type=courses[&country=AO][&stage=PT-SEC][&kind=bachelor][&q=enf]
 *   type=stages&country=AO
 *   limit=1…50 (20 por omissão)
 *
 * Disciplinas exigem contexto de nível (etapa, ou ISCED + via): o catálogo
 * não sugere «Termodinâmica» a quem configura o primário.
 */
import {
  CatalogContextError,
  areasForContext,
  coursesFor,
  searchCourses,
  searchSubjects,
  subjectsForContext,
  type LevelContext,
} from "./catalog";
import { COURSE_KIND_LABEL, type CourseKind } from "./data/courses";
import type { IscedLevel } from "./data/isced";
import { VERIFICATION_LABEL } from "./data/sources";
import { gradeLabel, stagesFor, type EducationStage } from "./data/stages";
import { SUBJECT_AREA_LABEL, isSubjectArea } from "./data/subjects";
import { CATALOG_VERSION } from "./overview";

export type CatalogApiResponse = { status: number; body: Record<string, unknown> };

const TRACKS = ["general", "technical", "higher"] as const;
const KINDS = Object.keys(COURSE_KIND_LABEL) as CourseKind[];

const bad = (error: string): CatalogApiResponse => ({ status: 400, body: { error } });

function intParam(params: URLSearchParams, name: string, min: number, max: number) {
  const raw = params.get(name);
  if (raw == null || raw === "") return { value: null as number | null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { error: `«${name}» tem de ser um número inteiro entre ${min} e ${max}.` };
  }
  return { value: n };
}

const text = (params: URLSearchParams, name: string, max: number) =>
  (params.get(name) ?? "").trim().slice(0, max);

function stageJson(s: EducationStage) {
  return {
    id: s.id,
    country: s.country,
    name: s.cycle ? `${s.name} — ${s.cycle}` : s.name,
    isced: s.isced,
    track: s.track,
    grades: s.grades.map((n) => ({ n, label: gradeLabel(s, n) })),
    periodModels: s.periodModels,
    assessment: s.assessment ?? null,
    courses: s.courses,
    hasPlan: s.curriculum.length > 0,
    status: s.status,
    statusLabel: VERIFICATION_LABEL[s.status],
    source: s.source,
    version: s.version,
  };
}

export function catalogSearch(params: URLSearchParams): CatalogApiResponse {
  const type = text(params, "type", 20) || "subjects";
  const q = text(params, "q", 80);
  const limit = intParam(params, "limit", 1, 50);
  if ("error" in limit) return bad(limit.error!);
  const max = limit.value ?? 20;
  const country = text(params, "country", 2).toUpperCase() || null;
  const stageId = text(params, "stage", 20) || null;

  try {
    if (type === "stages") {
      if (!country) return bad("Indique o país (country=AO).");
      return {
        status: 200,
        body: { version: CATALOG_VERSION, items: stagesFor(country).map(stageJson) },
      };
    }

    if (type === "courses") {
      const kind = text(params, "kind", 30) || null;
      if (kind && !KINDS.includes(kind as CourseKind)) {
        return bad(`«kind» inválido. Use: ${KINDS.join(", ")}.`);
      }
      const filter = { country, stageId, kind: (kind as CourseKind | null) ?? null };
      const list = q ? searchCourses(q, filter, max) : coursesFor(filter).slice(0, max);
      return {
        status: 200,
        body: {
          version: CATALOG_VERSION,
          items: list.map((c) => ({
            code: c.course.code,
            name: c.course.name,
            short: c.course.short,
            kind: c.course.kind,
            kindLabel: COURSE_KIND_LABEL[c.course.kind],
            isced: c.isced,
            field: c.course.field,
            typicalYears: c.course.typicalYears ?? null,
            stages: c.stages,
            match: c.match ?? null,
          })),
        },
      };
    }

    if (type !== "subjects" && type !== "areas") {
      return bad("«type» inválido. Use: subjects, areas, courses ou stages.");
    }
    const area = text(params, "area", 20) || null;
    if (area && !isSubjectArea(area)) {
      return bad(`«area» inválida. Use: ${Object.keys(SUBJECT_AREA_LABEL).join(", ")}.`);
    }

    let ctx: LevelContext;
    if (stageId) {
      const grade = intParam(params, "grade", 0, 13);
      if ("error" in grade) return bad(grade.error!);
      ctx = { stageId, course: text(params, "course", 20) || null, grade: grade.value };
    } else {
      const isced = intParam(params, "isced", 0, 8);
      if ("error" in isced) return bad(isced.error!);
      const track = text(params, "track", 20);
      if (isced.value == null || !TRACKS.includes(track as (typeof TRACKS)[number])) {
        return bad(
          "Disciplinas e áreas precisam do nível de ensino: stage=<etapa> (ex.: AO-ESG2), ou isced=0…8 e track=general|technical|higher.",
        );
      }
      ctx = { isced: isced.value as IscedLevel, track: track as EducationStage["track"], country };
    }
    if (type === "areas") {
      return { status: 200, body: { version: CATALOG_VERSION, items: areasForContext(ctx) } };
    }
    const subjectArea = area && isSubjectArea(area) ? area : null;
    const list = q
      ? searchSubjects(q, ctx, max, subjectArea)
      : subjectsForContext(ctx, { area: subjectArea }).slice(0, max);
    return {
      status: 200,
      body: {
        version: CATALOG_VERSION,
        items: list.map((s) => ({
          code: s.subject.code,
          name: s.displayName,
          canonicalName: s.subject.name,
          short: s.subject.short,
          field: s.subject.field,
          area: s.subject.area ? SUBJECT_AREA_LABEL[s.subject.area] : null,
          inPlan: s.inPlan,
          status: s.status,
          statusLabel: VERIFICATION_LABEL[s.status],
          source: s.sourceTitle,
          match: s.match ?? null,
        })),
      },
    };
  } catch (error) {
    if (error instanceof CatalogContextError) return bad(error.message);
    throw error;
  }
}
