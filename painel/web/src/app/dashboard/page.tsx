"use client"

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getDocsUrl,
  getSigaLoginUrl,
  getAdminTenantsUrl,
} from "@/lib/ecosystem-urls"
import { fetchSaasPlans, type SaasPlan } from "@/lib/saas-api"

function formatAoa(value?: number) {
  if (value == null) return "—"
  return new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  }).format(value)
}

export default function DashboardPage() {
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchSaasPlans().then((list) => {
      setPlans(list)
      setLoading(false)
    })
  }, [])

  return (
    <MarketingLayout
      title="Área do visitante"
      description="Conheça planos, crie a escola ou entre no SIGA se já é cliente."
      eyebrow="Portal comercial"
    >
      <div className="container mx-auto space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/start">Criar escola</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/pricing">Ver planos</Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={getSigaLoginUrl()} target="_blank" rel="noreferrer">
              Entrar no SIGA
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <a href={getDocsUrl("/guide/")} target="_blank" rel="noreferrer">
              Documentação
            </a>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Escolher plano</CardTitle>
              <CardDescription>Preços oficiais da plataforma</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/pricing">Abrir preços</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Criar escola</CardTitle>
              <CardDescription>Wizard `/start` · trial 14 dias</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/start">Começar</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Operar no SIGA</CardTitle>
              <CardDescription>Alunos, notas, propinas — na app escolar</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" asChild>
                <a href={getSigaLoginUrl()} target="_blank" rel="noreferrer">
                  Abrir SIGA
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Planos activos</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Catálogo indisponível. Confirme a API SaaS / SQL `plans`.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <Card key={plan.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      <Badge variant="secondary">{plan.code}</Badge>
                    </div>
                    <CardDescription>{formatAoa(plan.price_aoa_monthly)} / mês</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button size="sm" className="w-full" asChild>
                      <Link to="/start">Escolher</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <p className="text-xs text-muted-foreground">
          Operadores da plataforma:{" "}
          <a className="underline" href={getAdminTenantsUrl()} target="_blank" rel="noreferrer">
            Control Center
          </a>
          .
        </p>
      </div>
    </MarketingLayout>
  )
}
