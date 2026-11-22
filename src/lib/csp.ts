import { readJsonBodyLimited } from "./read-json-body";

/**
 * Content-Security-Policy do SIGA, por agora só em modo de relatório
 * (`Content-Security-Policy-Report-Only`): o browser não bloqueia nada, só
 * envia para `CSP_REPORT_PATH` o que teria bloqueado. Com os relatórios limpos
 * nos logs do Worker, passa-se o mesmo texto para `Content-Security-Policy`.
 *
 * Ligações do browser para fora (levantadas no código):
 * - Supabase (REST, Auth, Storage e Realtime por WebSocket);
 * - Firebase Cloud Messaging (notificações push);
 * - api.pwnedpasswords.com (verificação de palavra-passe exposta, k-anonimato);
 * - api.github.com (versão e tamanhos da app de computador em /transferir).
 * Scripts e janelas de fora: o botão Google (GSI) e o hCaptcha da entrada por senha
 * (`AuthCaptcha`), que o Supabase exige — sem ele na política, a CSP obrigatória
 * deixaria toda a gente sem entrar. O hCaptcha pede os seus domínios em script-src,
 * style-src, frame-src e connect-src (documentação «Content Security Policy» dele).
 * A letra (Inter) é servida pelo próprio SIGA, em /fonts/inter.
 * As integrações (Zoom, Moodle, WhatsApp…) só abrem separadores, não precisam.
 *
 * `script-src` mantém 'unsafe-inline' porque o TanStack Start injecta scripts
 * inline na hidratação; tirá-lo exige nonces.
 */
export const CSP_REPORT_PATH = "/api/public/csp-report";

const HCAPTCHA = "https://hcaptcha.com https://*.hcaptcha.com";

const DIRECTIVES: ReadonlyArray<readonly [string, string]> = [
  ["default-src", "'self'"],
  ["script-src", `'self' 'unsafe-inline' https://accounts.google.com/gsi/client ${HCAPTCHA}`],
  ["style-src", `'self' 'unsafe-inline' https://accounts.google.com/gsi/style ${HCAPTCHA}`],
  ["font-src", "'self' data:"],
  ["img-src", "'self' data: blob: https:"],
  [
    "connect-src",
    [
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://*.portal-siga.com",
      "https://*.googleapis.com",
      "https://accounts.google.com/gsi/",
      "https://api.pwnedpasswords.com",
      "https://api.github.com",
      HCAPTCHA,
    ].join(" "),
  ],
  ["frame-src", `'self' https://accounts.google.com/gsi/ ${HCAPTCHA}`],
  ["worker-src", "'self' blob:"],
  ["manifest-src", "'self'"],
  ["media-src", "'self' blob: data:"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
  ["frame-ancestors", "'self'"],
  ["report-uri", CSP_REPORT_PATH],
];

/** A política com fontes a mais em algumas directivas (as restantes ficam iguais). */
function policyWith(extra: Readonly<Record<string, string>> = {}): string {
  return DIRECTIVES.map(
    ([name, value]) => `${name} ${extra[name] ? `${value} ${extra[name]}` : value}`,
  ).join("; ");
}

export const CONTENT_SECURITY_POLICY = policyWith();

/**
 * Política das páginas do website escolar (`school-website/site-http.ts`): a do SIGA,
 * mais o Google Fonts, de onde o modelo de `painel/escolas` carrega DM Sans e Manrope.
 * Com a política do SIGA, cada página vista mandava 9 relatórios (a folha e 8 ficheiros
 * de letra): 9 pedidos ao Worker por visita, e relatórios que nunca ficariam limpos.
 */
export const SCHOOL_WEBSITE_CONTENT_SECURITY_POLICY = policyWith({
  "style-src": "https://fonts.googleapis.com",
  "font-src": "https://fonts.gstatic.com",
});

/**
 * Política OBRIGATÓRIA do website escolar (análise 22, P1-1), enviada como
 * `Content-Security-Policy` ao lado da de relatório acima.
 *
 * A sessão do SIGA vive num cookie do domínio-pai que qualquer página de
 * `*.portal-siga.com` lê. O website de cada escola é a superfície com conteúdo das
 * escolas, servida na mesma origem do portal: um XSS aqui entregava sessões. As 67
 * páginas do modelo não têm scripts em linha, `on…=` nem `javascript:` (verificado em
 * `tests/school-website/website-csp.test.ts`) e só carregam `/_school-website/*.js`,
 * por isso `script-src 'self'` não bloqueia nada do modelo e bloqueia o que for injectado.
 * Sem Google (GSI) nem hCaptcha: o website não os usa. Os estilos em linha continuam
 * permitidos (o modelo usa quatro `style=`).
 */
export const SCHOOL_WEBSITE_ENFORCED_CONTENT_SECURITY_POLICY =
  SCHOOL_WEBSITE_CONTENT_SECURITY_POLICY.split("; ")
    .map((entry) => {
      const name = entry.split(" ")[0];
      if (name === "script-src") return "script-src 'self'";
      if (name === "frame-src") return "frame-src 'self'";
      return entry;
    })
    .join("; ");

/** Relatórios maiores do que isto são ignorados (o browser manda ~1 KB). */
const MAX_REPORT_BYTES = 16 * 1024;

type Violation = {
  directive: string;
  blocked: string;
  page: string;
  source?: string;
};

/** URL sem query nem fragmento: os relatórios não levam tokens nem dados pessoais para os logs. */
function stripUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    // "inline", "eval", "data", "self"…
    return value.slice(0, 200);
  }
}

function toViolation(body: Record<string, unknown>): Violation | null {
  const directive =
    body["effective-directive"] ??
    body["effectiveDirective"] ??
    body["violated-directive"] ??
    body["violatedDirective"];
  if (typeof directive !== "string") return null;
  const file = body["source-file"] ?? body["sourceFile"];
  const line = body["line-number"] ?? body["lineNumber"];
  return {
    directive,
    blocked: stripUrl(body["blocked-uri"] ?? body["blockedURL"]),
    page: stripUrl(body["document-uri"] ?? body["documentURL"]),
    ...(typeof file === "string" && file
      ? { source: `${stripUrl(file)}${typeof line === "number" ? `:${line}` : ""}` }
      : {}),
  };
}

/**
 * Lê os dois formatos de relatório: o antigo (`application/csp-report`,
 * `{"csp-report": {...}}`) e o da Reporting API (`application/reports+json`,
 * lista de `{type: "csp-violation", body: {...}}`).
 */
export function parseCspReports(payload: unknown): Violation[] {
  const bodies: unknown[] = Array.isArray(payload)
    ? payload
        .filter((entry) => (entry as { type?: unknown })?.type === "csp-violation")
        .map((entry) => (entry as { body?: unknown }).body)
    : [(payload as { "csp-report"?: unknown } | null)?.["csp-report"]];
  return bodies
    .filter((body): body is Record<string, unknown> => !!body && typeof body === "object")
    .map(toViolation)
    .filter((violation): violation is Violation => violation !== null)
    .slice(0, 20);
}

/** Recebe os relatórios do browser e escreve-os nos logs do Worker. Responde sempre 204. */
export async function handleCspReport(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  // Os relatórios chegam de browsers não autenticados. A medição de bytes
  // durante a leitura cobre pedidos chunked e Content-Length subdeclarado.
  const parsed = await readJsonBodyLimited(request, MAX_REPORT_BYTES);
  if (!parsed.ok) {
    return new Response(null, { status: parsed.reason === "too_large" ? 413 : 204 });
  }
  for (const violation of parseCspReports(parsed.value)) {
    console.warn(`[csp] ${JSON.stringify(violation)}`);
  }
  return new Response(null, { status: 204 });
}
