/**
 * De que conta é o contacto usado na recuperação de senha por código.
 *
 * O código prova só a posse do contacto. Por isso o contacto tem de ser da
 * conta de facto, e não um dado de ficha:
 * - e-mail: o e-mail da própria conta no Supabase Auth (não `people.email`,
 *   que a secretaria ou um formulário de matrícula preenchem);
 * - telefone: o telefone da conta no Auth, ou um número que essa conta
 *   confirmou por código (`phone_change`). `profiles.phone` sozinho não
 *   basta: o perfil deixa gravá-lo sem verificação.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type OtpRow = { attempts_left: number; expires_at: string; consumed_at: string | null };

/** Código aceite: consumido antes de expirar e sem as tentativas esgotadas. */
export function isAcceptedOtp(row: OtpRow): boolean {
  if (!row.consumed_at || row.attempts_left <= 0) return false;
  return new Date(row.consumed_at).getTime() <= new Date(row.expires_at).getTime();
}

type AuthUser = { id: string; email?: string | null; phone?: string | null };

async function authUser(admin: SupabaseClient, userId: string): Promise<AuthUser | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user ?? null;
}

async function findAuthUser(
  admin: SupabaseClient,
  matches: (user: AuthUser) => boolean,
): Promise<AuthUser | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const found = data.users.find(matches);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

const samePhone = (a: string | null | undefined, b: string) =>
  Boolean(a) && a!.replace(/^\+/, "") === b.replace(/^\+/, "");

export async function resolveResetAccount(
  db: SupabaseClient,
  admin: SupabaseClient,
  normalized: string,
): Promise<string | null> {
  if (normalized.includes("@")) {
    const byEmail = (user: AuthUser) => user.email?.toLowerCase() === normalized;
    // Atalho: a ficha dá um candidato, mas só vale se o Auth confirmar.
    const { data: person } = await db
      .from("people")
      .select("user_id")
      .eq("email", normalized)
      .not("user_id", "is", null)
      .limit(1)
      .maybeSingle();
    const hinted = person?.user_id ? await authUser(admin, String(person.user_id)) : null;
    if (hinted && byEmail(hinted)) return hinted.id;
    return (await findAuthUser(admin, byEmail))?.id ?? null;
  }

  const { data: profiles } = await db
    .from("profiles")
    .select("id")
    .eq("phone", normalized)
    .limit(5);
  for (const profile of profiles ?? []) {
    const userId = String(profile.id);
    const user = await authUser(admin, userId);
    if (user && samePhone(user.phone, normalized)) return userId;
    const { data: otps } = await db
      .from("verification_otps")
      .select("attempts_left, expires_at, consumed_at")
      .eq("user_id", userId)
      .eq("purpose", "phone_change")
      .eq("target_identifier", normalized)
      .not("consumed_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if ((otps ?? []).some(isAcceptedOtp)) return userId;
  }
  return (await findAuthUser(admin, (user) => samePhone(user.phone, normalized)))?.id ?? null;
}
