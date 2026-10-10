import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * Duas invariantes sobre as rotas de `src/routes/api/`, ambas escritas depois de
 * falharem em produção:
 *
 * 1. **A rota tem de estar registada.** Três webhooks usavam a convenção do
 *    Next.js (`export async function POST`) em vez de `createFileRoute`. Os
 *    tipos compilavam, os testes dos handlers passavam e o build corria — mas o
 *    endpoint não existia. O servidor de desenvolvimento avisava a cada
 *    arranque e o aviso passou a ser ruído.
 *
 * 2. **Quem usa o cliente admin tem de ter guarda.** `loadSgaAdminClient`
 *    devolve a chave service_role, que ignora RLS. Três rotas usavam-na sem
 *    qualquer verificação de identidade; uma delas permitia redireccionar o
 *    e-mail institucional de qualquer escola.
 *
 * Nenhum destes casos era detectável por `tsc`, por lint ou pelos testes de
 * unidade dos handlers. Daí este teste olhar para o ficheiro como texto.
 */

const API_DIR = resolve(__dirname, "../../src/routes/api");
const ROUTE_TREE = resolve(__dirname, "../../src/routeTree.gen.ts");

/**
 * Rotas deliberadamente públicas. Cada entrada tem de justificar por que razão
 * não precisa de sessão — se a justificação não se aplicar, a rota precisa de
 * guarda, não de uma linha nova nesta lista.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  "saas/signup.tsx": "registo público de escola; protegido por honeypot e rate-limit",
  "saas/plans.tsx": "tabela de preços mostrada no site comercial",
  "saas/education-catalog.tsx":
    "resumo do catálogo educacional (ISCED, etapas por país, fontes): só dados de referência, sem escolas nem pessoas",
  "saas/tenants.lookup.tsx": "resolve a escola pelo slug para o wizard e para o branding do login",
  "saas/domains.check.tsx": "verifica disponibilidade de slug durante o registo",
  "saas/me.tsx": "devolve a sessão actual; responde 401 quando não há",
  "calendar.ics.tsx": "feed ICS autenticado por token na query (calendar_feed_tokens)",
  "catracas/device-scan.tsx": "dispositivo de catraca autentica-se por apiKey no corpo",
  "finance/gateway.confirm.tsx": "webhook de gateway autenticado por apiKey da escola",
  "finance/gateway.unitel.confirm.tsx": "webhook de gateway autenticado por apiKey da escola",
  "integrations/zoom/callback.tsx": "callback OAuth do Zoom, validado por state",
};

/** Expressões que contam como verificação de identidade ou de origem. */
const GUARD_PATTERNS = [
  "requirePlatformAdmin",
  "requireSupabaseAuth",
  "requireTenantAccess",
  "resolveBearerUserId",
  "requireSgaWriter",
  "resolvePlatformSessionFromRequest",
  "verifyResendWebhookSignature",
  "verifyTwilioWebhookSignature",
  "verifyMetaWebhookSignature",
  "payflowSettlementAuthorized",
  "timingSafeEqual",
];

const ADMIN_CLIENT_PATTERNS = ["loadSgaAdminClient", "supabaseAdmin"];

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const routeFiles = listRouteFiles(API_DIR).map((full) => ({
  full,
  rel: relative(API_DIR, full),
  source: readFileSync(full, "utf8"),
}));

const routeTree = readFileSync(ROUTE_TREE, "utf8");

describe("rotas de API", () => {
  it("encontra rotas para inspeccionar", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  describe("estão registadas no routeTree", () => {
    for (const route of routeFiles) {
      it(route.rel, () => {
        expect(
          route.source.includes("createFileRoute"),
          `${route.rel} não exporta uma Route. O TanStack Start ignora ` +
            `\`export async function POST\` — o endpoint não existe. ` +
            `Use createFileRoute(...)({ server: { handlers: { POST } } }).`,
        ).toBe(true);

        const declared = route.source.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]/)?.[1];
        expect(declared, `${route.rel} não declara caminho em createFileRoute`).toBeTruthy();
        expect(
          routeTree.includes(`'${declared}'`) || routeTree.includes(`"${declared}"`),
          `${declared} não aparece em routeTree.gen.ts — a rota não está servida. ` +
            `Arrancar o servidor de desenvolvimento regenera o ficheiro.`,
        ).toBe(true);
      });
    }
  });

  describe("não usam a chave service_role sem guarda", () => {
    for (const route of routeFiles) {
      it(route.rel, () => {
        const usesAdminClient = ADMIN_CLIENT_PATTERNS.some((p) => route.source.includes(p));
        if (!usesAdminClient) return;

        const hasGuard = GUARD_PATTERNS.some((p) => route.source.includes(p));
        const publicReason = PUBLIC_BY_DESIGN[route.rel];

        expect(
          hasGuard || Boolean(publicReason),
          `${route.rel} usa o cliente admin (ignora RLS) sem verificação de ` +
            `identidade. Acrescente uma guarda — requireTenantAccess para ` +
            `operações de uma escola, requirePlatformAdminFromRequest para ` +
            `operações da plataforma — ou, se for mesmo pública, documente a ` +
            `razão em PUBLIC_BY_DESIGN.`,
        ).toBe(true);
      });
    }
  });

  it("a lista de rotas públicas não tem entradas obsoletas", () => {
    const existing = new Set(routeFiles.map((route) => route.rel));
    const stale = Object.keys(PUBLIC_BY_DESIGN).filter((rel) => !existing.has(rel));
    expect(
      stale,
      `entradas em PUBLIC_BY_DESIGN sem rota correspondente: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});
