import { E2E_LIVE_ADMIN_PASSWORD } from "./sga-live-admin";

export const ECOSYSTEM_E2E_URLS = {
  web: process.env.VITE_WEB_URL ?? "http://localhost:5174",
  siga: process.env.VITE_SIGA_URL ?? "http://localhost:3006",
  admin: process.env.VITE_ADMIN_URL ?? "http://localhost:3005",
  docs: process.env.VITE_DOCS_URL ?? "http://localhost:5173",
} as const;

export function isLiveE2EEnabled() {
  return process.env.SIGA_E2E_LIVE === "1" || process.env.SIGA_E2E_LIVE === "true";
}

export function uniqueE2ESlug(prefix = "e2e") {
  return `${prefix}-${Date.now().toString(36)}`;
}

/**
 * O payload que os testes @live enviam para `/api/saas/signup`.
 *
 * Tem de satisfazer `publicSchoolSignupInputSchema` — e já falhou por não o
 * satisfazer: quando o `nif` passou a obrigatório, este payload ficou a
 * receber 400 e ninguém notou, porque estes ficheiros são `.spec.ts` e o
 * vitest só corre `.test.ts`. `tests/saas/signup-payload-contract.test.ts`
 * valida este objecto contra o schema do servidor a cada corrida.
 */
export function buildSignupPayload(slug: string) {
  const email = `e2e+${slug}@siga-plus.test`;
  return {
    name: `Escola E2E ${slug}`,
    nif: "5417000000", // NIF de entidade válido; o registo passou a exigi-lo
    contact_name: "Director E2E",
    contact_email: email,
    plan_code: "start" as const,
    slug,
    admin_name: "Director E2E",
    admin_email: email,
    admin_password: E2E_LIVE_ADMIN_PASSWORD,
    website: "",
  };
}

export function getPublicEnrollmentUrl(slug: string) {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  return `${ECOSYSTEM_E2E_URLS.siga}/matricula/${clean}`;
}
