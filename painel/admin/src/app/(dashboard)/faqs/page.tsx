"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getDocsUrl, getWebUrl } from "@/lib/ecosystem-urls"

const FAQS = [
  {
    q: "Quem pode entrar neste Control Center?",
    a: "Só contas em `platform_admins`. Director / Secretaria da escola entram no SIGA, não aqui.",
    href: getDocsUrl("/admin/control-center.html"),
  },
  {
    q: "Como crio uma escola nova?",
    a: "Wizard comercial no WEB `/start` (ou botão Nova escola). Provisionamento via API SaaS no SIGA.",
    href: getWebUrl("/start"),
  },
  {
    q: "Onde vejo trials a expirar?",
    a: "Agenda SaaS (`/calendar`) e Fila operacional (`/tasks`), com dados de `subscriptions`.",
    href: "/calendar",
  },
  {
    q: "DNS custom falhou — o que faço?",
    a: "Domínios → Verificar DNS. Manual em DOC admin/domains.",
    href: "/domains",
  },
  {
    q: "Webhooks Multicaixa com falhas?",
    a: "Operações gateway (`/dashboard-2`) + runbook DOC de integrações.",
    href: "/dashboard-2",
  },
  {
    q: "Posso gerir alunos ou propinas aqui?",
    a: "Não. Isso é operação escolar no SIGA. Aqui só tenants, planos, domínios e auditoria SaaS.",
    href: getDocsUrl("/arquitetura/responsabilidades.html"),
  },
]

export default function FaqsPage() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Perguntas do operador</h1>
        <p className="text-muted-foreground">
          FAQ do Control Center — conteúdo SIGA Plus, não o template shadcn.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {FAQS.map((item) => (
          <Card key={item.q}>
            <CardHeader>
              <CardTitle className="text-base">{item.q}</CardTitle>
              <CardDescription>{item.a}</CardDescription>
            </CardHeader>
            <CardContent>
              {item.href.startsWith("http") ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={item.href} target="_blank" rel="noreferrer">
                    Abrir
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={item.href}>Abrir</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="secondary" asChild>
        <a href={getDocsUrl("/guide/support.html")} target="_blank" rel="noreferrer">
          Suporte institucional (DOC)
          <ExternalLink className="size-4" />
        </a>
      </Button>
    </div>
  )
}
