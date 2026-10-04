/**
 * Verificação de hCaptcha no servidor, para pedidos públicos fora do Supabase Auth
 * (o login já é verificado pelo próprio Auth).
 *
 * Só exige quando `HCAPTCHA_SECRET_KEY` está definida no Worker: sem ela nada muda,
 * e o WEB só mostra o widget quando tem `VITE_HCAPTCHA_SITE_KEY`. Os dois têm de ser
 * configurados juntos (mesmo par da conta hCaptcha).
 */
const VERIFY_URL = "https://api.hcaptcha.com/siteverify";

export function hcaptchaRequired(): boolean {
  return Boolean(process.env["HCAPTCHA_SECRET_KEY"]?.trim());
}

export async function verifyHcaptcha(
  token: string | undefined,
  remoteIp: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const secret = process.env["HCAPTCHA_SECRET_KEY"]?.trim();
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);
    const res = await fetcher(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    return res.ok && data.success === true;
  } catch {
    // Sem resposta do hCaptcha não se cria a escola: o registo pode esperar.
    return false;
  }
}
