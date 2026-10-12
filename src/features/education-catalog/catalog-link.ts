/**
 * Liga disciplinas acabadas de criar ao catálogo (`subjects.catalog_subject_code`,
 * migração 20261012120000) quando o nome é exactamente uma disciplina do
 * catálogo (nome, nome local ou sinónimo; nunca siglas soltas).
 *
 * Complementar e tolerante: a disciplina já foi criada por quem chama, com as
 * verificações dele; isto só acrescenta a ligação. Se a coluna ainda não existe
 * (migração por aplicar) ou a gravação falha, não liga e não estraga nada — a
 * escola pode ligar depois em «Rever disciplinas». Nunca substitui uma ligação
 * existente (`IS NULL`).
 */
import { subjectCatalogKey } from "./normalize";

type LinkResult = PromiseLike<{ data: unknown; error: unknown }>;
type LinkQuery = {
  eq: (column: string, value: unknown) => LinkQuery;
  in: (column: string, values: unknown[]) => LinkQuery;
  is: (column: string, value: null) => LinkQuery;
  select: (columns: string) => LinkResult;
};
type LinkDb = { from: (table: string) => unknown };

export async function linkNewSubjectsToCatalog(
  db: LinkDb,
  schoolId: string,
  subjects: ReadonlyArray<{ id: string; name: string }>,
): Promise<number> {
  const byCode = new Map<string, string[]>();
  for (const s of subjects) {
    const key = subjectCatalogKey(s.name);
    if (!key) continue;
    byCode.set(key, [...(byCode.get(key) ?? []), s.id]);
  }
  let linked = 0;
  for (const [code, ids] of byCode) {
    try {
      const table = db.from("subjects") as {
        update?: (values: Record<string, unknown>) => LinkQuery;
      };
      if (typeof table.update !== "function") return linked;
      const { data, error } = await table
        .update({ catalog_subject_code: code })
        .eq("school_id", schoolId)
        .in("id", ids)
        .is("catalog_subject_code", null)
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
