/**
 * Liga disciplinas e cursos acabados de criar ao catálogo
 * (`subjects.catalog_subject_code`, `programs.catalog_course_code`, migração
 * 20261012120000) quando o nome é exactamente uma entrada do catálogo (nome,
 * nome local ou sinónimo; nunca siglas soltas nem nomes que servem dois cursos).
 *
 * Complementar e tolerante: o registo já foi criado por quem chama, com as
 * verificações dele; isto só acrescenta a ligação. Se a coluna ainda não existe
 * (migração por aplicar) ou a gravação falha, não liga e não estraga nada — a
 * escola pode ligar depois em «Rever disciplinas». Nunca substitui uma ligação
 * existente (`IS NULL`).
 */
import { courseCatalogKey, subjectCatalogKey, type CourseScope } from "./normalize";

type LinkResult = PromiseLike<{ data: unknown; error: unknown }>;
type LinkQuery = {
  eq: (column: string, value: unknown) => LinkQuery;
  in: (column: string, values: unknown[]) => LinkQuery;
  is: (column: string, value: null) => LinkQuery;
  select: (columns: string) => LinkResult;
};
type LinkDb = { from: (table: string) => unknown };

export function linkNewSubjectsToCatalog(
  db: LinkDb,
  schoolId: string,
  subjects: ReadonlyArray<{ id: string; name: string }>,
): Promise<number> {
  return linkNew(db, "subjects", "catalog_subject_code", subjectCatalogKey, schoolId, subjects);
}

/** `scope`: o curso é do ensino superior ou não — «Contabilidade» é outro curso em cada um. */
export function linkNewProgramsToCatalog(
  db: LinkDb,
  schoolId: string,
  programs: ReadonlyArray<{ id: string; name: string }>,
  scope: CourseScope | null,
): Promise<number> {
  return linkNew(
    db,
    "programs",
    "catalog_course_code",
    (name) => courseCatalogKey(name, scope),
    schoolId,
    programs,
  );
}

async function linkNew(
  db: LinkDb,
  table: "subjects" | "programs",
  column: "catalog_subject_code" | "catalog_course_code",
  keyOf: (name: string) => string | null,
  schoolId: string,
  rows: ReadonlyArray<{ id: string; name: string }>,
): Promise<number> {
  const byCode = new Map<string, string[]>();
  for (const row of rows) {
    const key = keyOf(row.name);
    if (!key) continue;
    byCode.set(key, [...(byCode.get(key) ?? []), row.id]);
  }
  let linked = 0;
  for (const [code, ids] of byCode) {
    try {
      const query = db.from(table) as {
        update?: (values: Record<string, unknown>) => LinkQuery;
      };
      if (typeof query.update !== "function") return linked;
      const { data, error } = await query
        .update({ [column]: code })
        .eq("school_id", schoolId)
        .in("id", ids)
        .is(column, null)
        .select("id");
      // Coluna em falta (42703/PGRST204) ou outra recusa: fica por ligar.
      if (error) return linked;
      linked += Array.isArray(data) ? data.length : 0;
    } catch {
      return linked;
    }
  }
  return linked;
}
