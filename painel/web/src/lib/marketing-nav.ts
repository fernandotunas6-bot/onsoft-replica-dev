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
  { nameKey: "landing.pricing", landingHref: "#pricing", pageHref: "/pricing" },
  { nameKey: "landing.faq", landingHref: "#faq", pageHref: "/faqs" },
  { nameKey: "landing.desktop", landingHref: "/download", pageHref: "/download" },
  { nameKey: "landing.contact", landingHref: "#contact", pageHref: "/#contact" },
]

export const MARKETING_FOOTER_LINKS = {
  product: [
    { name: "Funcionalidades", href: "/#features" },
    { name: "Preços", href: "/pricing" },
    { name: "App para computador", href: "/download" },
    { name: "Criar escola", href: getCreateSchoolUrl() },
  ],
  company: [
    { name: "Sobre", href: "/#about" },
    { name: "Para quem", href: "/#roles" },
    { name: "Blog", href: "/blog" },
    { name: "Contacto", href: "/#contact" },
  ],
  resources: [
    { name: "Primeiros passos", href: getDocsUrl("/siga/primeiros-passos.html") },
    { name: "Criar a escola", href: getDocsUrl("/web/criar-escola.html") },
    { name: "FAQ", href: "/faqs" },
    { name: "Financeiro escolar", href: getDocsUrl("/siga/financeiro-escolar.html") },
  ],
  legal: [
    { name: "Privacidade", href: "/privacidade" },
    { name: "Termos", href: "/termos" },
  ],
} as const

export { getCreateSchoolUrl, getSigaLoginUrl }
