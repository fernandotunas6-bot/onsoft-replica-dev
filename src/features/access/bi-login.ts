import { z } from "zod";
import { normalizeAngolaIdentity, validateAngolaBi } from "@/lib/angola-identity";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

export const signInWithIdentifierInputSchema = z.object({
  identifier: z.string().trim().min(3).max(100),
  password: z.string().min(1).max(200),
  // O projecto tem captcha activa; sem este sinal o `/auth/v1/token` recusa antes de
  // sequer olhar para a senha. Opcional para o caso de a protecção ser desligada.
  captchaToken: z.string().min(1).max(4000).optional(),
});
export type SignInWithIdentifierInput = z.infer<typeof signInWithIdentifierInputSchema>;

export type PasswordGrantResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | {
      ok: false;
      error:
        | "invalid_credentials"
        | "email_not_confirmed"
        | "rate_limited"
        | "captcha_failed"
        | "unavailable";
    };

/**
 * Pede a sessão ao Supabase Auth (`grant_type=password`) com a chave pública.
 * O erro é reduzido a um código: a mensagem do Auth não volta ao browser.
 */
export async function passwordGrant(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
  captchaToken?: string,
): Promise<PasswordGrantResult> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return { ok: false, error: "unavailable" };

  let response: Response;
  try {
    response = await fetchImpl(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        ...(captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}),
      }),
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    response.ok &&
    typeof body.access_token === "string" &&
    typeof body.refresh_token === "string"
  ) {
    return { ok: true, accessToken: body.access_token, refreshToken: body.refresh_token };
  }
  const code = String(body.error_code ?? body.code ?? body.msg ?? body.error ?? "").toLowerCase();
  if (code.includes("captcha")) return { ok: false, error: "captcha_failed" };
  if (response.status === 429 || code.includes("rate")) return { ok: false, error: "rate_limited" };
  if (code.includes("not_confirmed") || code.includes("not confirmed")) {
    return { ok: false, error: "email_not_confirmed" };
  }
  if (response.status >= 500) return { ok: false, error: "unavailable" };
  // Só se acusa a senha quando o Auth o diz. Tudo o resto — conta suspensa, registo
  // desligado, um código que o GoTrue passe a devolver amanhã — caía aqui e saía como
  // «Email ou senha incorrectos»: foi assim que a captcha se disfarçou de senha errada
  // durante três dias, e ninguém tinha por onde pegar.
  if (
    code.includes("invalid_credentials") ||
    code.includes("invalid login credentials") ||
    code.includes("invalid_grant")
  ) {
    return { ok: false, error: "invalid_credentials" };
  }
  console.warn(`[bi-login] recusa não reconhecida do Auth: ${response.status} ${code}`);
  return { ok: false, error: "unavailable" };
}

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

  // O mesmo B.I. pode estar em fichas de várias escolas, e o e-mail de uma ficha
  // é escrito pela secretaria. Com `limit(1)` sem ordem, uma ficha com o e-mail
  // errado noutra escola podia impedir a pessoa certa de entrar. Agora: as fichas
  // ligadas a uma conta têm prioridade; sem nenhuma, conta o e-mail das outras —
  // e só se apontarem todas para o mesmo (ambíguo = não se escolhe ao acaso).
  const pickEmail = (rows: Array<{ email: string | null; user_id: string | null }> | null) => {
    const unique = (list: Array<{ email: string | null }>) => {
      const emails = new Set(
        list
          .map((row) =>
            String(row.email ?? "")
              .trim()
              .toLowerCase(),
          )
          .filter((email) => email.includes("@")),
      );
      return emails.size === 1 ? [...emails][0] : null;
    };
    const all = rows ?? [];
    const linked = all.filter((row) => row.user_id);
    return linked.length ? unique(linked) : unique(all);
  };

  const { data: byBi } = await db
    .from("people")
    .select("email, user_id")
    .eq("national_id", searchId)
    .limit(20);
  const biEmail = pickEmail(byBi);
  if (biEmail) return biEmail;

  // Havia aqui um segundo ramo que lia `profiles.email` quando a pessoa tinha
  // `user_id`. `profiles` não tem coluna `email`, pelo que o PostgREST recusava
  // a consulta e o ramo nunca devolvia nada — o e-mail já vinha de `people`.

  // Fallback por telefone, também em `people` e pela mesma regra.
  const { data: byPhone } = await db
    .from("people")
    .select("email, user_id")
    .eq("phone", searchId)
    .limit(20);
  const phoneEmail = pickEmail(byPhone);
  if (phoneEmail) return phoneEmail;

  return trimmed;
}
