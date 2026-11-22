/**
 * PayFlow desactivado — decisão do proprietário de 15/11/2026.
 *
 * Uma só chave estática (`PAYFLOW_INTEGRATION_API_KEY`) servia de prova de pagamento para o
 * SIGA, de sincronização e de entrada de administrador nesta consola, em todas as escolas
 * (análise 22 do SIGA, P1-2: `docs/auditoria/22-analise-critica-sistema-2026-11-15.md` na
 * raiz). Até haver chaves separadas e liquidação assinada, o Worker responde «desactivado» a
 * tudo: checkout, portal do aluno, consola, API e webhooks. O `/api/v1/health` responde 200
 * com `status: "disabled"`, para a publicação, o ADMIN e a vigilância distinguirem
 * «desligado de propósito» de «em baixo».
 *
 * Falha fechada: só `PAYFLOW_ENABLED=true` (ou `1`) nas variáveis do Worker volta a ligar.
 * Do lado do SIGA há o interruptor correspondente (`src/lib/payflow-switch.ts`).
 */
export const PAYFLOW_DISABLED_MESSAGE =
  "O PayFlow está desactivado. Os pagamentos registam-se na Tesouraria da escola.";

export function isPayflowServiceEnabled(
  env: { PAYFLOW_ENABLED?: unknown } | null | undefined,
): boolean {
  const value = env?.PAYFLOW_ENABLED;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

/** A mesma base de `next.config.ts`, mais `noindex` em tudo (incluindo `/`). */
const DISABLED_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "X-Robots-Tag": "noindex, nofollow",
};

const DISABLED_PAGE = `<!doctype html>
<html lang="pt-AO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>PayFlow desactivado</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}
main{max-width:28rem;padding:2rem 1.5rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 .75rem}
p{margin:0;line-height:1.5;color:#334155}
@media (prefers-color-scheme:dark){body{background:#0b1120;color:#e2e8f0}p{color:#cbd5e1}}
</style>
</head>
<body>
<main>
<h1>O PayFlow está desactivado</h1>
<p>Os pagamentos das propinas registam-se na tesouraria da escola, que entrega o recibo. Para dúvidas sobre valores ou prazos, contacte a tesouraria.</p>
</main>
</body>
</html>
`;

function withHeaders(extra: Record<string, string>) {
  return new Headers({ ...DISABLED_HEADERS, ...extra });
}

/** Resposta do Worker enquanto o PayFlow estiver desactivado. */
export function disabledResponse(request: Request): Response {
  const { pathname } = new URL(request.url);

  if (pathname === "/api/v1/health") {
    return new Response(
      JSON.stringify({
        data: { service: "payflow", status: "disabled", message: PAYFLOW_DISABLED_MESSAGE },
      }),
      {
        status: 200,
        headers: withHeaders({
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        }),
      },
    );
  }

  if (pathname.startsWith("/api/")) {
    return new Response(
      JSON.stringify({ error: { code: "payflow_disabled", message: PAYFLOW_DISABLED_MESSAGE } }),
      { status: 503, headers: withHeaders({ "Content-Type": "application/json; charset=utf-8" }) },
    );
  }

  return new Response(DISABLED_PAGE, {
    status: 503,
    headers: withHeaders({ "Content-Type": "text/html; charset=utf-8" }),
  });
}
