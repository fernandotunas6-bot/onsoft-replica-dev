import { getCreateSchoolUrl, getDocsUrl, getSigaLoginUrl } from "@/lib/ecosystem-urls"

export type MarketingNavItem = {
  nameKey: string
  /** Rota absoluta ou hash na landing */
  landingHref: string
  pageHref: string
  megaMenu?: boolean
}

/** Itens principais da navbar comercial — partilhados em todas as páginas externas. */
export const MARKETING_NAV_ITEMS: MarketingNavItem[] = [
  { nameKey: "landing.home", landingHref: "#hero", pageHref: "/" },
  { nameKey: "landing.features", landingHref: "#features", pageHref: "/#features" },
  { nameKey: "landing.solutions", landingHref: "#features", pageHref: "/#features", megaMenu: true },
  { nameKey: "landing.team", landingHref: "#team", pageHref: "/#team" },
  { nameKey: "landing.pricing", landingHref: "#pricing", pageHref: "/pricing" },
  { nameKey: "landing.faq", landingHref: "#faq", pageHref: "/faqs" },
  { nameKey: "landing.contact", landingHref: "#contact", pageHref: "/#contact" },
]

export const MARKETING_FOOTER_LINKS = {
  product: [
    { name: "Funcionalidades", href: "/#features" },
    { name: "Preços", href: "/pricing" },
    { name: "Criar escola", href: getCreateSchoolUrl() },
    { name: "Documentação", href: getDocsUrl() },
  ],
  company: [
    { name: "Sobre", href: "/#about" },
    { name: "Novidades", href: "/#blog" },
    { name: "Equipa", href: "/#team" },
    { name: "Contacto", href: "/#contact" },
  ],
  resources: [
    { name: "Ajuda", href: getDocsUrl() },
    { name: "FAQ", href: "/faqs" },
    { name: "Manuais", href: getDocsUrl("/guide/") },
    { name: "Arquitectura", href: getDocsUrl("/arquitetura/") },
  ],
  legal: [
    { name: "Privacidade", href: "/#privacy" },
    { name: "Termos", href: "/#terms" },
    { name: "Segurança", href: "/#security" },
    { name: "Estado", href: "/#status" },
  ],
} as const

export { getCreateSchoolUrl, getSigaLoginUrl }
