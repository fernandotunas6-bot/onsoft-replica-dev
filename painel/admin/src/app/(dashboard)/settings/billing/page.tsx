"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { fetchSaasPlans, type SaasPlanRow } from "@/lib/saas-api"
import { getWebUrl } from "@/lib/ecosystem-urls"

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

export default function BillingSettings() {
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
          <h1 className="text-3xl font-bold">Catálogo SaaS</h1>
          <p className="text-muted-foreground">
            Planos activos da plataforma (mesma fonte que o WEB e o wizard de criação).
            Cobrança por escola é gerida em Escolas clientes.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={getWebUrl("/pricing")} target="_blank" rel="noreferrer">
            Ver página comercial
            <ExternalLink className="size-4" />
          </a>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar planos…</p>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nenhum plano activo. Confirme `plans` em Supabase ou a API{" "}
            <code className="text-xs">GET /api/saas/plans</code>.
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
                    .slice(0, 6)
                    .map((label) => (
                      <li key={label}>• {label}</li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Operação</CardTitle>
          <CardDescription>
            Suspender, activar ou rever trial de cada escola na lista de tenants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/tenants">Ir para Escolas clientes</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
