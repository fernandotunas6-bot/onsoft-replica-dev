import type { SupabaseClient } from "@supabase/supabase-js";

/** New content stays disabled until the database itself closes direct member access. */
export async function schoolWebStorageReady(db: SupabaseClient): Promise<boolean> {
  try {
    const result = await db.rpc("school_web_storage_ready");
    return !result.error && result.data === true;
  } catch {
    return false;
  }
}
export async function requireSchoolWebStorage(db: SupabaseClient) {
  if (!(await schoolWebStorageReady(db)))
    throw new Error(
      "A protecção dos conteúdos do website e do blog ainda não está activa. Peça ao responsável pela plataforma que aplique a actualização da base de dados antes de publicar.",
    );
}
