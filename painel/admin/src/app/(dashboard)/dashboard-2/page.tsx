"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Activity, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getAdminAccessToken } from "@/lib/admin-session"
import { getDocsUrl, getPayflowUrl } from "@/lib/ecosystem-urls"
import {
  fetchGatewayWebhookMetrics,
  fetchPayflowPublicHealth,
  type GatewayWebhookMetrics,
  type PayflowPublicHealth,
} from "@/lib/saas-api"

export default function Dashboard2Page() {
  const [metrics, setMetrics] = useState<GatewayWebhookMetrics | null>(null)
  const [payflow, setPayflow] = useState<PayflowPublicHealth | null>(null)
  const [payflowError, setPayflowError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)

  const loadPayflow = useCallback(async () => {
    const result = await fetchPayflowPublicHealth()
    if (!result.ok) {
      setPayflow(null)
      setPayflowError(result.error)
      return
    }
    setPayflowError(null)
    setPayflow(result.health)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    void loadPayflow()
    const token = await getAdminAccessToken()
    if (!token) {
      setNeedsAuth(true)
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    const result = await fetchGatewayWebhookMetrics(token)
    if (!result.ok) {
      setError(result.error || "Falha ao carregar métricas.")
      setMetrics(null)
    } else {
      setMetrics(result.metrics ?? null)
    }
    setLoading(false)
  }, [loadPayflow])

  useEffect(() => {
    void load()
  }, [load])

  const s24 = metrics?.summary.last24h
  const s7 = metrics?.summary.last7d

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operações gateway</h1>
          <p className="text-muted-foreground">
            Pulso EMIS / Unitel e estado do PayFlow (camada de cobrança) — sem propinas escolares.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button size="sm" asChild>
            <Link href="/gateway-webhooks">
              <Activity className="size-4" />
              Detalhe webhooks
            </Link>
          </Button>
        </div>
      </div>

      {needsAuth ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Sessão `platform_admins` necessária.{" "}
            <Link className="underline" href="/sign-in">
              Entrar
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <img
                src={getPayflowUrl("/brands/payflow-icon.png")}
                alt=""
                width={20}
                height={20}
                className="size-5 rounded"
              />
              PayFlow
            </CardTitle>
            <CardDescription>
              Camada transaccional — health público, sem faturas nem alunos.
            </CardDescription>
          </div>
          <Badge variant={payflow?.status === "ok" ? "secondary" : "destructive"}>
            {payflow?.status === "ok" ? payflow.runtime?.mode ?? "ok" : payflowError ?? "offline"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Integração {payflow?.runtime?.integrationConfigured ? "ligada" : "por configurar"}
            {" · "}SSO {payflow?.runtime?.ssoConfigured ? "ok" : "em falta"}
            {" · "}Acerto SIGA {payflow?.runtime?.sigaSettlementConfigured ? "ok" : "em falta"}
            {" · "}EMIS {payflow?.runtime?.emisHomologated ? "homologada" : "fechada"}
          </span>
          <Button size="sm" variant="outline" asChild>
            <a href={getPayflowUrl("/")} target="_blank" rel="noreferrer">
              Abrir PayFlow
            </a>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={getDocsUrl("/financeiro/payflow.html")} target="_blank" rel="noreferrer">
              Manual
            </a>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Eventos 24h</CardDescription>
            <CardTitle>{loading ? "…" : (s24?.total ?? "—")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>OK 24h</CardDescription>
            <CardTitle className="text-emerald-600 dark:text-emerald-400">
              {loading ? "…" : (s24?.ok ?? "—")}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Falhas 24h</CardDescription>
            <CardTitle className="text-destructive">
              {loading ? "…" : (s24?.failed ?? "—")}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Eventos 7d</CardDescription>
            <CardTitle>{loading ? "…" : (s7?.total ?? "—")}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {metrics?.lastRateAlert ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Último alerta de taxa</CardTitle>
            <CardDescription>
              {new Date(metrics.lastRateAlert.created_at).toLocaleString("pt-AO")} —{" "}
              {(metrics.lastRateAlert.failure_rate * 100).toFixed(1)}% falhas
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{metrics.lastRateAlert.reason}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Escolas com falhas (7d)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(metrics?.schoolsWithFailures7d ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma falha recente.</p>
          ) : (
            metrics!.schoolsWithFailures7d.map((row) => (
              <div
                key={row.school_id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  {row.school_name}
                  {row.tenant_slug ? (
                    <span className="text-muted-foreground"> · {row.tenant_slug}</span>
                  ) : null}
                </span>
                <Badge variant="destructive">{row.failures}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
