/**
 * Content-Security-Policy do SIGA, por agora só em modo de relatório
 * (`Content-Security-Policy-Report-Only`): o browser não bloqueia nada, só
 * envia para `CSP_REPORT_PATH` o que teria bloqueado. Com os relatórios limpos
 * nos logs do Worker, passa-se o mesmo texto para `Content-Security-Policy`.
 *
 * Ligações do browser para fora (levantadas no código):
 * - Supabase (REST, Auth, Storage e Realtime por WebSocket);
 * - Firebase Cloud Messaging (notificações push);
 * - api.pwnedpasswords.com (verificação de palavra-passe exposta, k-anonimato).
 * A letra (Inter) é servida pelo próprio SIGA, em /fonts/inter.
 * As integrações (Zoom, Moodle, WhatsApp…) só abrem separadores, não precisam.
 *
 * `script-src` mantém 'unsafe-inline' porque o TanStack Start injecta scripts
 * inline na hidratação; tirá-lo exige nonces.
 */
export const CSP_REPORT_PATH = "/api/public/csp-report";

const DIRECTIVES: ReadonlyArray<readonly [string, string]> = [
  ["default-src", "'self'"],
  ["script-src", "'self' 'unsafe-inline'"],
  ["style-src", "'self' 'unsafe-inline'"],
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
      "https://api.pwnedpasswords.com",
    ].join(" "),
  ],
  ["frame-src", "'self'"],
  ["worker-src", "'self' blob:"],
  ["manifest-src", "'self'"],
  ["media-src", "'self' blob: data:"],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
  ["frame-ancestors", "'self'"],
  ["report-uri", CSP_REPORT_PATH],
];

export const CONTENT_SECURITY_POLICY = DIRECTIVES.map(([name, value]) => `${name} ${value}`).join(
  "; ",
);

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
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_REPORT_BYTES) return new Response(null, { status: 413 });
  try {
    const text = await request.text();
    if (text.length > MAX_REPORT_BYTES) return new Response(null, { status: 413 });
    for (const violation of parseCspReports(JSON.parse(text))) {
      console.warn(`[csp] ${JSON.stringify(violation)}`);
    }
  } catch {
    // Relatório mal formado: nada a registar.
  }
  return new Response(null, { status: 204 });
}
