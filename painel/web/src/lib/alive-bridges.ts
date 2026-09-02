/**
 * Pontes só para superfícies auth/settings que ainda não são produto WEB.
 * dashboard, mail, chat, calendar, tasks, users, pricing, faqs, start — vivas.
 */
import {
  getCreateSchoolUrl,
  getDocsUrl,
  getPricingUrl,
  getSigaLoginUrl,
} from "@/lib/ecosystem-urls"

export type AliveBridge = {
  to: string
  external?: boolean
  label: string
}

export const WEB_ALIVE_BRIDGES: Record<string, AliveBridge> = {
  "/landing": { to: "/", label: "Landing" },
  "/auth/sign-in-2": { to: "/auth/sign-in", label: "Entrar" },
  "/auth/sign-in-3": { to: "/auth/sign-in", label: "Entrar" },
  "/auth/sign-up": { to: getCreateSchoolUrl(), label: "Criar escola" },
  "/auth/sign-up-2": { to: getCreateSchoolUrl(), label: "Criar escola" },
  "/auth/sign-up-3": { to: getCreateSchoolUrl(), label: "Criar escola" },
  "/auth/forgot-password-2": { to: "/auth/forgot-password", label: "Recuperar senha" },
  "/auth/forgot-password-3": { to: "/auth/forgot-password", label: "Recuperar senha" },
  "/settings": { to: getPricingUrl(), label: "Planos" },
  "/settings/user": { to: getSigaLoginUrl(), external: true, label: "Conta no SIGA" },
  "/settings/account": { to: getSigaLoginUrl(), external: true, label: "Conta no SIGA" },
  "/settings/billing": { to: getPricingUrl(), label: "Planos" },
  "/settings/appearance": { to: "/", label: "Landing" },
  "/settings/notifications": {
    to: getDocsUrl("/guide/"),
    external: true,
    label: "Guia (DOC)",
  },
  "/settings/connections": {
    to: getDocsUrl("/integracoes/"),
    external: true,
    label: "Integrações (DOC)",
  },
  /** Login escolar → SIGA (WEB não autentica escolas). */
  "/auth/sign-in": {
    to: getSigaLoginUrl(),
    external: true,
    label: "Entrar no SIGA (escola)",
  },
}

/** Rotas de produto que permanecem no WEB (incluindo as revitalizadas). */
export const WEB_PRODUCT_PATHS = new Set([
  "/",
  "/start",
  "/pricing",
  "/faqs",
  "/landing",
  "/dashboard",
  "/dashboard-2",
  "/mail",
  "/chat",
  "/calendar",
  "/tasks",
  "/users",
  "/auth/forgot-password",
  "/errors/unauthorized",
  "/errors/forbidden",
  "/errors/not-found",
  "/errors/internal-server-error",
  "/errors/under-maintenance",
])

export function resolveWebAliveBridge(pathname: string): AliveBridge | null {
  const entries = Object.entries(WEB_ALIVE_BRIDGES).sort(
    (a, b) => b[0].length - a[0].length,
  )
  for (const [prefix, bridge] of entries) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return bridge
    }
  }
  return null
}

export { getAdminTenantsUrl } from "@/lib/ecosystem-urls"
