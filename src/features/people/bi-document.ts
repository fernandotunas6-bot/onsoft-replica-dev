import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { isAngolaBiNif, normalizePersonNif } from "@/lib/angola-identity";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * Uma pessoa com BI angolano no NIF tem o BI também em `person_documents`.
 * Usado ao editar a ficha, ao aceitar uma candidatura e na matrícula interna
 * (antes, cada sítio tinha a sua cópia, e a matrícula interna não o fazia).
 */
export async function syncBiDocumentFromNif(
  db: AdminDb,
  schoolId: string,
  personId: string,
  nif: string | null | undefined,
  userId: string,
) {
  if (!isAngolaBiNif(nif)) return;
  const compact = normalizePersonNif(nif);
  if (!compact) return;
  const { data: existing } = await db
    .from("person_documents")
    .select("id")
    .eq("school_id", schoolId)
    .eq("person_id", personId)
    .eq("document_type", "bi")
    .eq("document_number", compact)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing?.id) return;
  const { error } = await db.from("person_documents").insert({
    school_id: schoolId,
    person_id: personId,
    document_type: "bi",
    document_number: compact,
    created_by: userId,
    updated_by: userId,
  });
  if (error && !/duplicate|unique|23505/i.test(error.message)) {
    throw publicDatabaseError(error, "Não foi possível registar o BI.");
  }
}
