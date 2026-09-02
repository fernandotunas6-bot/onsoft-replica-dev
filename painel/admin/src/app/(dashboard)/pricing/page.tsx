"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fetchSaasPlans, type SaasPlanRow } from "@/lib/saas-api"
import { getDocsUrl, getWebUrl } from "@/lib/ecosystem-urls"

function formatAoa(value?: number) {
  if (value == null) return "—"
  return new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  }).format(value)
}

function featureLabels(features?: Record<string, boolean>) {
  if (!features) return []
  return Object.entries(features)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key.replace(/_/g, " "))
}

export default function PricingPage() {
  const [plans, setPlans] = useState<SaasPlanRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchSaasPlans().then((rows) => {
      setPlans(rows)
      setLoading(false)
    })
  }, [])

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de planos</h1>
          <p className="text-muted-foreground">
            Mesma API pública `GET /api/saas/plans` que o WEB e o wizard. Gestão por escola em
            Tenants / Subscrições.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/billing">Catálogo (definições)</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={getWebUrl("/pricing")} target="_blank" rel="noreferrer">
              Página comercial
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar planos…</p>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nenhum plano activo. Confirme `APPLY_SAAS_PLATFORM.sql` e a tabela `plans`.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <Badge variant="secondary">{plan.code}</Badge>
                </div>
                <CardDescription>{plan.description || "Plano SIGA Plus"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-bold">
                  {formatAoa(plan.price_aoa_monthly)}
                  <span className="text-sm font-normal text-muted-foreground"> / mês</span>
                </p>
                {plan.max_students ? (
                  <p className="text-xs text-muted-foreground">
                    Até {plan.max_students.toLocaleString("pt-AO")} alunos
                  </p>
                ) : null}
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {featureLabels(plan.features)
                    .slice(0, 8)
                    .map((label) => (
                      <li key={label}>• {label}</li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Preços comerciais e trial público:{" "}
        <a className="underline" href={getDocsUrl("/web/criar-escola.html")} target="_blank" rel="noreferrer">
          DOC WEB
        </a>
        .
      </p>
    </div>
  )
}
