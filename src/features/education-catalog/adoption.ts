/**
 * Adopção do catálogo pelas escolas, para o ADMIN: quantas disciplinas e
 * cursos de cada escola já estão ligados ao catálogo
 * (`subjects.catalog_subject_code`, `programs.catalog_course_code`, migração
 * 20261012120000), quantos ainda não estão mas o nome já os reconhece, e
 * quantos são próprios da escola. Só conta — não liga nada.
 */
import { courseCatalogKey, subjectCatalogKey } from "./normalize";

export type AdoptionRow = {
  id: string;
  school_id: string;
  name: string;
  /** Ausente antes da migração. */
  catalog_code?: string | null;
};

export type AdoptionCounts = {
  total: number;
  linked: number;
  /** Por ligar, mas o nome exacto já é uma entrada do catálogo. */
  recognized: number;
  /** Sem ligação nem correspondência pelo nome. */
  own: number;
};

export type SchoolAdoption = {
  schoolId: string;
  name: string;
  subjects: AdoptionCounts;
  courses: AdoptionCounts;
};

export type CatalogAdoption = {
  /** A migração 20261012120000 já está aplicada (as colunas existem). */
  linkAvailable: boolean;
  totals: { subjects: AdoptionCounts; courses: AdoptionCounts };
  schools: SchoolAdoption[];
};

const empty = (): AdoptionCounts => ({ total: 0, linked: 0, recognized: 0, own: 0 });

function count(target: AdoptionCounts, row: AdoptionRow, keyOf: (name: string) => string | null) {
  target.total += 1;
  if (row.catalog_code) target.linked += 1;
  else if (keyOf(row.name)) target.recognized += 1;
  else target.own += 1;
}

export function summarizeAdoption(input: {
  linkAvailable: boolean;
  schools: ReadonlyArray<{ id: string; name: string }>;
  subjects: readonly AdoptionRow[];
  programs: readonly AdoptionRow[];
}): CatalogAdoption {
  const bySchool = new Map<string, SchoolAdoption>(
    input.schools.map((s) => [
      s.id,
      { schoolId: s.id, name: s.name, subjects: empty(), courses: empty() },
    ]),
  );
  const totals = { subjects: empty(), courses: empty() };
  const school = (id: string) => {
    let entry = bySchool.get(id);
    if (!entry) {
      entry = { schoolId: id, name: "—", subjects: empty(), courses: empty() };
      bySchool.set(id, entry);
    }
    return entry;
  };
  for (const row of input.subjects) {
    count(school(row.school_id).subjects, row, subjectCatalogKey);
    count(totals.subjects, row, subjectCatalogKey);
  }
  // Sem o nível de cada curso aqui: só conta como reconhecido o nome que serve
  // um único curso do catálogo (a ligação na escola usa o nível).
  const courseKey = (name: string) => courseCatalogKey(name, null);
  for (const row of input.programs) {
    count(school(row.school_id).courses, row, courseKey);
    count(totals.courses, row, courseKey);
  }
  const schools = [...bySchool.values()]
    .filter((s) => s.subjects.total || s.courses.total)
    .sort(
      (a, b) =>
        b.subjects.recognized +
          b.courses.recognized -
          (a.subjects.recognized + a.courses.recognized) || a.name.localeCompare(b.name, "pt"),
    );
  return { linkAvailable: input.linkAvailable, totals, schools };
}
