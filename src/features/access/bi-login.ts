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

  if (person?.user_id) {
    const { data: profile } = await db
      .from("profiles")
      .select("email")
      .eq("id", person.user_id)
      .limit(1)
      .maybeSingle();

    if (profile?.email && profile.email.includes("@")) {
      return profile.email;
    }
  }

  // Fallback: search profile phone
  const { data: profileByPhone } = await db
    .from("profiles")
    .select("email")
    .eq("phone", searchId)
    .limit(1)
    .maybeSingle();

  if (profileByPhone?.email && profileByPhone.email.includes("@")) {
    return profileByPhone.email;
  }

  return trimmed;
}
