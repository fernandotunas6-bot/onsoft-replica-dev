import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

export type PersonLite = {
  id: string;
  full_name: string;
  photo_url: string | null;
  sex: string | null;
};

/**
 * Junção "pessoa" partilhada — antes reimplementada à parte em vários módulos
 * (academic, finance, documents, arquivos), cada um com o seu próprio conjunto de
 * colunas e sem filtro de school_id, o que deixava o nome/foto mostrados
 * inconsistentes entre ecrãs e a busca sem defesa em profundidade.
 */
export async function loadPersonNamesById(
  db: Db,
  schoolId: string,
  personIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!personIds.length) return map;
  const { data } = await db
    .from("people")
    .select("id, full_name")
    .eq("school_id", schoolId)
    .in("id", personIds);
  for (const row of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
    map.set(String(row.id), String(row.full_name ?? "—"));
  }
  return map;
}

/** Como loadPersonNamesById, mas também traz a foto — tenta photo_url, depois
 * avatar_url (SGA legado), depois só o nome, para nunca falhar por coluna em falta. */
export async function loadPeopleLite(
  db: Db,
  schoolId: string,
  personIds: string[],
): Promise<Map<string, PersonLite>> {
  const map = new Map<string, PersonLite>();
  if (!personIds.length) return map;
  const attempts = [
    "id, full_name, photo_url, sex",
    "id, full_name, avatar_url, sex",
    "id, full_name, photo_url",
    "id, full_name, avatar_url",
    "id, full_name",
  ];
  for (const columns of attempts) {
    const { data, error } = await db
      .from("people")
      .select(columns)
      .eq("school_id", schoolId)
      .in("id", personIds);
    if (error) continue;
    for (const row of data ?? []) {
      const record = row as unknown as Record<string, unknown>;
      map.set(String(record["id"]), {
        id: String(record["id"]),
        full_name: String(record["full_name"] ?? "—"),
        photo_url:
          (typeof record["photo_url"] === "string" && record["photo_url"]) ||
          (typeof record["avatar_url"] === "string" && record["avatar_url"]) ||
          null,
        sex: typeof record["sex"] === "string" ? record["sex"] : null,
      });
    }
    return map;
  }
  return map;
}
