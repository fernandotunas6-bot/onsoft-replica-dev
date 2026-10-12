/**
 * Cursos da escola contra o catálogo (`programs.catalog_course_code`,
 * migração 20261012120000): os reconhecidos pelo nome ou sinónimo, por ligar,
 * e os próprios da escola, que se podem ligar à mão. Só sugere.
 */
import { COURSE_KIND_LABEL, GLOBAL_COURSES, type GlobalCourse } from "./data/courses";
import { courseCatalogKey } from "./normalize";

export type SchoolCourse = {
  id: string;
  code: string;
  name: string;
  catalogCode?: string | null;
};

export type CourseLinkSuggestion = {
  id: string;
  code: string;
  name: string;
  catalogCode: string;
  catalogName: string;
};

export type CourseReview = {
  total: number;
  /** A base já tem `programs.catalog_course_code` (migração aplicada). */
  linkAvailable: boolean;
  linked: number;
  toLink: CourseLinkSuggestion[];
  /** Sem correspondência pelo nome nem ligação. */
  unmatched: SchoolCourse[];
};

const BY_CODE = new Map<string, GlobalCourse>(GLOBAL_COURSES.map((c) => [c.code, c]));

export function catalogCourse(code: string) {
  return BY_CODE.get(code);
}

/** Opções para ligar à mão: «Licenciatura — Enfermagem (LIC-ENF)». */
export function catalogCourseOptions() {
  return [...GLOBAL_COURSES]
    .map((c) => ({ code: c.code, label: `${COURSE_KIND_LABEL[c.kind]} — ${c.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt"));
}

export function reviewCourses(
  courses: readonly SchoolCourse[],
  linkAvailable = false,
): CourseReview {
  const toLink: CourseLinkSuggestion[] = [];
  const unmatched: SchoolCourse[] = [];
  let linked = 0;
  for (const c of courses) {
    if (c.catalogCode && BY_CODE.has(c.catalogCode)) {
      linked += 1;
      continue;
    }
    const key = courseCatalogKey(c.name);
    if (key) {
      toLink.push({
        id: c.id,
        code: c.code,
        name: c.name,
        catalogCode: key,
        catalogName: BY_CODE.get(key)!.name,
      });
    } else {
      unmatched.push(c);
    }
  }
  toLink.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  unmatched.sort((a, b) => a.name.localeCompare(b.name, "pt"));
  return { total: courses.length, linkAvailable, linked, toLink, unmatched };
}
