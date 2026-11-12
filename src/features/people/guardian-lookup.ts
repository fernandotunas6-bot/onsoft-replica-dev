import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

type AdminDb = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/** Nome para comparar: sem acentos, maiúsculas nem espaços repetidos. */
export function comparableName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Encarregado que a escola já tem, para a candidatura de um irmão não criar uma
 * segunda ficha da mesma pessoa (auditoria 14, P5).
 *
 * Só reaproveita com uma correspondência segura: o mesmo telefone (já
 * normalizado) e o mesmo nome, numa ficha activa que já é encarregado de algum
 * aluno da escola — e só se houver exactamente uma. Telefone sozinho não chega
 * (uma casa partilha o número); na dúvida, cria-se uma ficha nova, como antes.
 */
export async function findExistingGuardian(
  db: AdminDb,
  input: { schoolId: string; fullName: string; phone: string | null | undefined },
): Promise<string | null> {
  const phone = input.phone?.trim();
  const name = comparableName(input.fullName);
  if (!phone || !name) return null;

  const { data: people, error } = await db
    .from("people")
    .select("id, full_name")
    .eq("school_id", input.schoolId)
    .eq("phone", phone)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(20);
  if (error) throw publicDatabaseError(error, "Não foi possível procurar o encarregado.");
  const sameName = (people ?? []).filter((row) => comparableName(row.full_name) === name);
  if (!sameName.length) return null;

  const { data: links, error: linksError } = await db
    .from("student_guardians")
    .select("guardian_person_id")
    .eq("school_id", input.schoolId)
    .in(
      "guardian_person_id",
      sameName.map((row) => String(row.id)),
    );
  if (linksError) throw publicDatabaseError(linksError, "Não foi possível procurar o encarregado.");
  const guardians = new Set((links ?? []).map((row) => String(row.guardian_person_id)));
  return guardians.size === 1 ? [...guardians][0]! : null;
}
