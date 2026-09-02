/**
 * Pontes só para superfícies que ainda não têm função de produto no ADMIN.
 * Rotas vivas (dashboard, tasks, mail, chat, calendar, pricing, faqs, users)
 * NÃO entram aqui — renderizam páginas reais.
 */
import {
  getCreateSchoolUrl,
  getDocsUrl,
  getWebUrl,
} from "@/lib/ecosystem-urls"

export type AliveBridge = {
  to: string
  external?: boolean
  label: string
}

export const ADMIN_ALIVE_BRIDGES: Record<string, AliveBridge> = {
  "/landing": {
    to: getWebUrl("/"),
    external: true,
    label: "Portal comercial (WEB)",
  },
  "/sign-up": {
    to: getCreateSchoolUrl(),
    external: true,
    label: "Criar escola (WEB /start)",
  },
  "/sign-up-2": {
    to: getCreateSchoolUrl(),
    external: true,
    label: "Criar escola (WEB /start)",
  },
  "/sign-up-3": {
    to: getCreateSchoolUrl(),
    external: true,
    label: "Criar escola (WEB /start)",
  },
  "/sign-in-2": { to: "/sign-in", label: "Entrar no Control Center" },
  "/sign-in-3": { to: "/sign-in", label: "Entrar no Control Center" },
  "/forgot-password": { to: "/sign-in", label: "Entrar no Control Center" },
  "/forgot-password-2": { to: "/sign-in", label: "Entrar no Control Center" },
  "/forgot-password-3": { to: "/sign-in", label: "Entrar no Control Center" },
  "/settings/appearance": { to: "/settings/billing", label: "Catálogo SaaS" },
  "/settings/notifications": { to: "/mail", label: "Avisos da plataforma" },
  "/settings/connections": {
    to: getDocsUrl("/integracoes/"),
    external: true,
    label: "Integrações (DOC)",
  },
  "/settings/user": { to: "/platform-admins", label: "Operadores" },
  "/settings/account": { to: "/settings/billing", label: "Catálogo SaaS" },
  "/register": {
    to: getCreateSchoolUrl(),
    external: true,
    label: "Criar escola (WEB)",
  },
}

export function resolveAdminAliveBridge(pathname: string): AliveBridge | null {
  const entries = Object.entries(ADMIN_ALIVE_BRIDGES).sort(
    (a, b) => b[0].length - a[0].length,
  )
  for (const [prefix, bridge] of entries) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return bridge
    }
  }
  return null
}
