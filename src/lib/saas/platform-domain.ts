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
]);

/**
 * Retorna o domínio principal da plataforma configurado nas variáveis de ambiente.
 */
export function getPlatformDomain(): string {
  const envDomain =
    (typeof process !== "undefined" && process.env?.PLATFORM_DOMAIN) ||
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_PLATFORM_DOMAIN || import.meta.env?.PLATFORM_DOMAIN));

  if (envDomain && typeof envDomain === "string" && envDomain.trim()) {
    return envDomain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  }

  return "portal-siga.com";
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
      reason: "O endereço só pode conter letras minúsculas, números e hífens (não pode começar ou terminar com hífen).",
    };
  }

  if (isReservedSubdomain(normalized)) {
    return { valid: false, reason: `O endereço «${normalized}» está reservado pelo sistema.` };
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
