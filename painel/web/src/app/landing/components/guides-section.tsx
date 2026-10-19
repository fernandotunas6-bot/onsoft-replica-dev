import type { LucideIcon } from "lucide-react"
import { ArrowUpRight, BookOpenCheck, Landmark, Rocket, School } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getDocsUrl } from "@/lib/ecosystem-urls"

type Guide = { icon: LucideIcon; category: string; title: string; description: string; path: string }

/** Manuais do DOC (painel/docs) para quem está a começar. */
const GUIDES: Guide[] = [
  {
    icon: School,
    category: "Começar",
    title: "Criar a escola",
    description: "Os passos para criar a escola aqui no site, escolher o plano e convidar a equipa.",
    path: "/web/criar-escola.html",
  },
  {
    icon: Rocket,
    category: "SIGA",
    title: "Primeiros passos",
    description: "Ano lectivo, classes, turmas e propinas: o que configurar no primeiro dia.",
    path: "/siga/primeiros-passos.html",
  },
  {
    icon: BookOpenCheck,
    category: "Pedagógica",
    title: "Área pedagógica",
    description: "Horários, chamada e pautas oficiais com MAC, NPP e NPT no Centro de Avaliação.",
    path: "/siga/area-pedagogica.html",
  },
  {
    icon: Landmark,
    category: "Tesouraria",
    title: "Financeiro escolar",
    description: "Propinas, facturas e recibos com IBAN AO, e cobrança por Multicaixa Express.",
    path: "/siga/financeiro-escolar.html",
  },
]

export function GuidesSection() {
  return (
    <section id="guides" className="bg-muted/50 py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Manuais
          </Badge>
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">Guias para começar</h2>
          <p className="text-muted-foreground text-lg">
            Manuais curtos, em português, para a secretaria, a tesouraria e os professores.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDES.map(({ icon: Icon, category, title, description, path }) => (
            <a
              key={path}
              href={getDocsUrl(path)}
              className="group bg-card hover:border-primary/40 focus-visible:ring-ring flex flex-col rounded-2xl border p-6 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-muted-foreground mt-4 text-xs font-medium">{category}</span>
              <h3 className="group-hover:text-primary mt-1 font-semibold transition-colors">{title}</h3>
              <p className="text-muted-foreground mt-1 flex-1 text-sm leading-relaxed">{description}</p>
              <span className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-medium">
                Ler o manual
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
