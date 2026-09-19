import { z } from "zod";
import { normalizeAngolaIdentity, validateAngolaBi } from "@/lib/angola-identity";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

export const resolveBiToEmailInputSchema = z.object({
  identifier: z.string().trim().min(3).max(100),
});
export type ResolveBiToEmailInput = z.infer<typeof resolveBiToEmailInputSchema>;

export async function resolveBiOrEmailToUserEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return trimmed;
  }

  const compact = normalizeAngolaIdentity(trimmed);
  const biValidation = validateAngolaBi(compact);

  if (!biValidation.ok && compact.length < 5) {
    return trimmed;
  }

  const db = await loadSgaAdminClient();
  const searchId = biValidation.compact ?? compact;

  // Search by national_id in people
  const { data: person } = await db
    .from("people")
    .select("user_id, email, national_id")
    .eq("national_id", searchId)
    .limit(1)
    .maybeSingle();

  if (person?.email && person.email.includes("@")) {
    return person.email;
  }

  // Havia aqui um segundo ramo que lia `profiles.email` quando a pessoa tinha
  // `user_id`. `profiles` não tem coluna `email`, pelo que o PostgREST recusava
  // a consulta e o ramo nunca devolvia nada — o e-mail já vinha de `people`,
  // acima.

  // Fallback por telefone, também em `people` e pela mesma razão.
  const { data: profileByPhone } = await db
    .from("people")
    .select("email")
    .eq("phone", searchId)
    .limit(1)
    .maybeSingle();

  if (profileByPhone?.email && profileByPhone.email.includes("@")) {
    return profileByPhone.email;
  }

  return trimmed;
}
