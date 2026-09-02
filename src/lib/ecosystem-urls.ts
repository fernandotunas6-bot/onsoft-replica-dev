/**
 * Resolução Centralizada de URLs do Ecossistema SIGA Plus.
 * 
 * Permite navegação harmonizada entre:
 * - WEB (Landing, Preços, Criar Escola, Comercial): PORT 5174
 * - ADMIN (Control Center SaaS, Tenants, Billing): PORT 3005
 * - SIGA PLUS (Operação Escolar, Alunos, Pautas): PORT 3006
 * - DOC (Documentação, Manuais, APIs): PORT 5173
 */

export const ECOSYSTEM_URLS = {
  web: import.meta.env.VITE_WEB_URL || "http://localhost:5174",
  siga: import.meta.env.VITE_SIGA_URL || "http://localhost:3006",
  admin: import.meta.env.VITE_ADMIN_URL || "http://localhost:3005",
  docs: import.meta.env.VITE_DOCS_URL || "http://localhost:5173",
} as const;

/** Caminhos DOC frequentes (suffix `.html` para links estáticos VitePress). */
export const DOC_PATHS = {
  sigaHome: "/siga/index.html",
  sigaNavigation: "/siga/navegacao.html",
  guideFeatures: "/guide/features.html",
  guideSupport: "/guide/support.html",
  guideSqlSga: "/guide/sql-sga.html",
  guideInstallation: "/guide/installation.html",
  financeSaft: "/financeiro/saft-agt-exportacao.html",
  integracoesEmis: "/integracoes/emis-multicaixa-unitel.html",
  integracoesProducao: "/integracoes/gateway-producao.html",
  integracoesPortalBanco: "/integracoes/gateway-portal-banco.html",
  integracoesRunbook: "/integracoes/gateway-runbook-suporte.html",
  adminControlCenter: "/admin/control-center.html",
  arquitetura: "/arquitetura/index.html",
} as const;

/**
 * Retorna o link directo para a documentação técnica ou manual do utilizador
 */
export function getDocUrl(path = "/guide/index.html"): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.docs}${cleanPath}`;
}

/** Mapa de navegação e permissões do SIGA (sidebar, launcher, RBAC). */
export function getSigaNavDocUrl(): string {
  return getDocUrl(DOC_PATHS.sigaNavigation);
}

/**
 * Retorna o link para a página comercial de preços/planos
 */
export function getPricingUrl(): string {
  return `${ECOSYSTEM_URLS.web}/pricing`;
}

/**
 * Retorna o link para o wizard de criação comercial de escola
 */
export function getCreateSchoolUrl(): string {
  return `${ECOSYSTEM_URLS.web}/start`;
}

/**
 * Retorna o link para o painel SaaS Admin Central
 */
export function getSaasAdminUrl(): string {
  return getAdminUrl("/tenants");
}

/** URL do webhook de confirmação EMIS/Multicaixa (POST). */
export function getFinanceGatewayConfirmUrl(): string {
  return `${ECOSYSTEM_URLS.siga}/api/finance/gateway/confirm`;
}

/** URL dedicada Unitel Money (POST — canal fixo unitel_money). */
export function getUnitelGatewayConfirmUrl(): string {
  return `${ECOSYSTEM_URLS.siga}/api/finance/gateway/unitel/confirm`;
}

/** Rota do SaaS Control Center (ADMIN). */
export function getAdminUrl(path = "/tenants"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${ECOSYSTEM_URLS.admin}${clean}`;
}

/** Login / onboarding no produto escolar. */
export function getSigaLoginUrl(): string {
  return ECOSYSTEM_URLS.siga;
}

/** Link público de candidatura (/matricula/$slug). */
export function getPublicEnrollmentUrl(slug: string): string {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  return `${ECOSYSTEM_URLS.siga}/matricula/${clean}`;
}
