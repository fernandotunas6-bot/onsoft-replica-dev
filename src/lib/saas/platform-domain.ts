/**
 * Configuração centralizada do domínio da plataforma SIGA Plus.
 * Lê a variável PLATFORM_DOMAIN / VITE_PLATFORM_DOMAIN ou usa o fallback canónico.
 * NUNCA espalhar domínios diretamente pelo código.
 */

export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  "www",
  "app",
  "admin",
  "saas-admin",
  "api",
  "auth",
  "status",
  "mail",
  "smtp",
  "imap",
  "pop",
  "support",
  "suporte",
  "billing",
  "financeiro",
  "commercial",
  "comercial",
  "docs",
  "documentation",
  "help",
  "ajuda",
  "system",
  "sistema",
  "cdn",
  "static",
  "assets",
  "security",
  "seguranca",
  "login",
  "signup",
  "register",
  "root",
  "cloud",
  "noreply",
  "notificacoes",
  "portal",
  "web",
  "payflow",
  "pagamentos",
  "payments",
]);

/**
 * Subdomínios fixos do ecossistema sob PLATFORM_DOMAIN.
 * Nunca atribuíveis a escolas; DNS wildcard cobre o resto.
 */
export const ECOSYSTEM_PLATFORM_SUBDOMAINS = {
  web: "www",
  siga: "app",
  admin: "admin",
  docs: "docs",
  payflow: "payflow",
} as const;

export type EcosystemPlatformApp = keyof typeof ECOSYSTEM_PLATFORM_SUBDOMAINS;

/**
 * Retorna o domínio principal da plataforma configurado nas variáveis de ambiente.
 */
export function getPlatformDomain(): string {
  const envDomain =
    (typeof process !== "undefined" && process.env?.PLATFORM_DOMAIN) ||
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_PLATFORM_DOMAIN || import.meta.env?.PLATFORM_DOMAIN));

  if (envDomain && typeof envDomain === "string" && envDomain.trim()) {
    return envDomain
      .trim()
      .toLowerCase()
      .replace(/^\.+|\.+$/g, "");
  }

  return "portal-siga.com";
}

/**
 * Hostname canónico de uma app do ecossistema: `payflow.{{PLATFORM_DOMAIN}}`.
 */
export function getEcosystemPlatformHost(app: EcosystemPlatformApp): string {
  return `${ECOSYSTEM_PLATFORM_SUBDOMAINS[app]}.${getPlatformDomain()}`;
}

/**
 * Origin HTTPS canónica: `https://payflow.{{PLATFORM_DOMAIN}}`.
 * Em produção, preferir VITE_* / NEXT_PUBLIC_* quando o deploy usa Pages/Workers distintos.
 */
export function getEcosystemPlatformOrigin(app: EcosystemPlatformApp): string {
  return `https://${getEcosystemPlatformHost(app)}`;
}

/** Domínio histórico da plataforma, ainda aceite pelo resolver de hostnames. */
export const LEGACY_PLATFORM_DOMAIN = "portal-siga.com";

/**
 * O hostname é da plataforma (o domínio configurado, o legado, ou um subdomínio
 * deles)? Estes endereços são atribuídos no provisionamento e nunca podem ser
 * registados como domínio próprio de uma escola.
 */
export function isPlatformOwnedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  return [getPlatformDomain(), LEGACY_PLATFORM_DOMAIN].some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

/**
 * Retorna o subdomínio completo da plataforma para um slug dado.
 * Ex.: `esperanca` → `esperanca.portal-siga.com` (ou `esperanca.siga.ao`)
 */
export function getPlatformSubdomain(slug: string): string {
  const domain = getPlatformDomain();
  const cleanSlug = slug.trim().toLowerCase();
  return `${cleanSlug}.${domain}`;
}

/**
 * Verifica se um slug é um subdomínio reservado do sistema.
 */
export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug.trim().toLowerCase());
}

/**
 * Rótulo DNS com «--» na 3.ª e 4.ª posição (RFC 5891): reservado para nomes
 * internacionalizados. `xn--…` é mostrado pelos browsers com outros caracteres
 * (punycode), o que permitiria um endereço que se lê como o de outra escola.
 */
export function hasReservedDnsHyphens(slug: string): boolean {
  return slug.trim().toLowerCase().slice(2, 4) === "--";
}

/**
 * Validação rigorosa de slug de escola.
 */
export function validateTenantSlug(slug: string): { valid: boolean; reason?: string } {
  const normalized = slug.trim().toLowerCase();

  if (!normalized) {
    return { valid: false, reason: "O endereço da escola é obrigatório." };
  }

  if (normalized.length < 3) {
    return { valid: false, reason: "O endereço deve ter pelo menos 3 caracteres." };
  }

  if (normalized.length > 50) {
    return { valid: false, reason: "O endereço não pode ter mais de 50 caracteres." };
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalized) && normalized.length > 2) {
    return {
      valid: false,
      reason:
        "O endereço só pode conter letras minúsculas, números e hífens (não pode começar ou terminar com hífen).",
    };
  }

  if (isReservedSubdomain(normalized)) {
    return { valid: false, reason: `O endereço «${normalized}» está reservado pelo sistema.` };
  }

  if (hasReservedDnsHyphens(normalized)) {
    return {
      valid: false,
      reason: "O endereço não pode ter dois hífens seguidos na 3.ª e 4.ª posição (ex.: «xn--»).",
    };
  }

  return { valid: true };
}

/**
 * Normaliza um nome de escola em um slug preliminar válido.
 */
export function slugifySchoolName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove caracteres especiais
    .trim()
    .replace(/\s+/g, "-") // espaços para hífen
    .replace(/-+/g, "-") // hífens duplicados
    .slice(0, 50)
    .replace(/^-+|-+$/g, ""); // apara hífens das pontas
}
