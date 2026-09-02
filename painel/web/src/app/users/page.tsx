"use client"

import { Link } from "react-router-dom"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminTenantsUrl, getSigaLoginUrl } from "@/lib/ecosystem-urls"

const PERSONAS: Array<{
  title: string
  desc: string
  cta: { label: string; to?: string; href?: string }
}> = [
  {
    title: "Visitante / comprador",
    desc: "Planos, demo, criar escola neste portal WEB.",
    cta: { label: "Ver planos", to: "/pricing" },
  },
  {
    title: "Director / Secretaria",
    desc: "Operação diária no SIGA — pessoas, matrículas, documentos.",
    cta: { label: "Entrar no SIGA", href: getSigaLoginUrl() },
  },
  {
    title: "Tesoureiro / Professor",
    desc: "Caixa, pautas e planos de aula na app escolar (papéis no SIGA).",
    cta: { label: "Abrir SIGA", href: getSigaLoginUrl() },
  },
  {
    title: "Platform admin",
    desc: "Tenants e billing SaaS no Control Center — não na escola.",
    cta: { label: "Control Center", href: getAdminTenantsUrl() },
  },
]

export default function UsersPage() {
  return (
    <MarketingLayout
      title="Para quem é o SIGA Plus"
      description="Personas do ecossistema — cada uma no sítio certo (WEB, SIGA ou ADMIN)."
      eyebrow="Ecossistema"
    >
      <div className="container mx-auto grid gap-4 px-4 py-10 sm:px-6 md:grid-cols-2 lg:px-8">
        {PERSONAS.map((p) => (
          <Card key={p.title}>
            <CardHeader>
              <CardTitle className="text-base">{p.title}</CardTitle>
              <CardDescription>{p.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              {p.cta.to ? (
                <Button size="sm" asChild>
                  <Link to={p.cta.to}>{p.cta.label}</Link>
                </Button>
              ) : (
                <Button size="sm" asChild>
                  <a href={p.cta.href} target="_blank" rel="noreferrer">
                    {p.cta.label}
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </MarketingLayout>
  )
}
