import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** Ficha de professor da própria conta nesta escola (null se não for professor aqui). */
export async function ownTeacherId(db: Db, schoolId: string, userId: string) {
  const { data } = await db
    .from("teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}
