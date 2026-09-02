"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Activity, AlertTriangle, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import {
  fetchGatewayWebhookMetrics,
  type GatewayWebhookMetrics,
} from "@/lib/saas-api"
import { getDocsUrl } from "@/lib/ecosystem-urls"

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

function pct(ok: number, total: number) {
  if (!total) return "—"
  return `${Math.round((ok / total) * 100)}%`
}

function channelLabel(channel: string) {
  if (channel === "unitel_money") return "Unitel"
  if (channel === "multicaixa_express") return "Multicaixa"
  return channel
}

const RATE_THRESHOLD = 0.25
const RATE_MIN_EVENTS = 5

function isElevatedFailureRate(summary: { total: number; failed: number }) {
  if (summary.total < RATE_MIN_EVENTS) return false
  return summary.failed / summary.total >= RATE_THRESHOLD
}

export default function GatewayWebhooksPage() {
  const [metrics, setMetrics] = useState<GatewayWebhookMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await accessToken()
    const result = await fetchGatewayWebhookMetrics(token)
    if (!token || result.error?.includes("Unauthorized") || result.error?.includes("Sem permissão")) {
      setNeedsAuth(true)
      setMetrics(null)
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    if (!result.ok) {
      setError(result.error || "Falha ao carregar.")
      setLoading(false)
      return
    }
    setMetrics(result.metrics ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const summary = metrics?.summary
  const elevated24h = summary ? isElevatedFailureRate(summary.last24h) : false

  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 lg:px-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks gateway</h1>
          <p className="text-muted-foreground">
            Métricas cross-tenant EMIS/Unitel — eventos de `finance_gateway_webhook_events`.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="size-4" />
          Actualizar
        </Button>
      </div>

      <div className="px-4 lg:px-6">
        {needsAuth ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Inicie sessão como administrador da plataforma.{" "}
              <Link href="/sign-in?next=/gateway-webhooks" className="font-medium text-primary underline">
                Entrar
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {metrics && !metrics.available ? (
          <Card className="mb-4">
            <CardContent className="flex items-start gap-3 py-6 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                Tabela de telemetria ainda não aplicada no SGA. Execute{" "}
                <code className="text-xs">npm run siga:sql</code> →{" "}
                <code className="text-xs">APPLY_IN_SQL_EDITOR.sql</code>.
              </div>
            </CardContent>
          </Card>
        ) : null}

        {summary && elevated24h ? (
          <Card className="mb-4 border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-start gap-3 py-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Taxa de falha 24h elevada</p>
                <p className="text-muted-foreground">
                  {summary.last24h.failed} falhas em {summary.last24h.total} eventos (
                  {pct(summary.last24h.ok, summary.last24h.total)} sucesso). Limiar operacional:{" "}
                  {Math.round(RATE_THRESHOLD * 100)}% com mínimo {RATE_MIN_EVENTS} eventos. Configure{" "}
                  <code className="text-xs">SIGA_GATEWAY_FAILURE_RATE_ALERT_*</code> ou execute{" "}
                  <code className="text-xs">npm run siga:gateway-failure-rate-check</code> em cron.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {metrics?.lastRateAlert ? (
          <Card className="mb-4">
            <CardContent className="py-4 text-sm">
              <p className="font-medium">Último alerta de taxa enviado</p>
              <p className="text-muted-foreground">
                {new Date(metrics.lastRateAlert.created_at).toLocaleString("pt-AO", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
                {" · "}
                {Math.round(metrics.lastRateAlert.failure_rate * 100)}% falhas (
                {metrics.lastRateAlert.failed_24h}/{metrics.lastRateAlert.total_24h}) —{" "}
                {metrics.lastRateAlert.reason}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Registado em{" "}
                <Link href="/audit" className="underline underline-offset-2 hover:text-foreground">
                  Auditoria SaaS
                </Link>{" "}
                como <code className="text-[10px]">GATEWAY_FAILURE_RATE_ALERT</code>.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {summary ? (
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Últimas 24h</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.last24h.total}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.last24h.ok} OK · {summary.last24h.failed} falhas · taxa{" "}
                  {pct(summary.last24h.ok, summary.last24h.total)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Últimos 7 dias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.last7d.total}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.last7d.ok} OK · {summary.last7d.failed} falhas · taxa{" "}
                  {pct(summary.last7d.ok, summary.last7d.total)}
                </p>
              </CardContent>
            </Card>
            {Object.entries(summary.byChannel).map(([channel, row]) => (
              <Card key={channel}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {channelLabel(channel)} (24h)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{row.total24h}</div>
                  <p className="text-xs text-muted-foreground">{row.failed24h} falhas</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Falhas recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Escola</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        A carregar…
                      </TableCell>
                    </TableRow>
                  ) : !metrics?.recentFailures.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Activity className="size-4" />
                          Nenhuma falha recente registada.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    metrics.recentFailures.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString("pt-AO", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.tenant_name ?? row.school_name ?? "—"}
                          {row.tenant_slug ? (
                            <div className="font-mono text-[10px] text-muted-foreground">{row.tenant_slug}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{channelLabel(row.channel)}</Badge>
                        </TableCell>
                        <TableCell>{row.http_status}</TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                          {row.message}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Escolas com mais falhas (7d)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Escola</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="text-right">Falhas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        A carregar…
                      </TableCell>
                    </TableRow>
                  ) : !metrics?.schoolsWithFailures7d.length ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Nenhuma escola com falhas na última semana.
                      </TableCell>
                    </TableRow>
                  ) : (
                    metrics.schoolsWithFailures7d.map((row) => (
                      <TableRow key={row.school_id}>
                        <TableCell>{row.school_name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.tenant_slug ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">{row.failures}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <p className="mt-4 text-xs text-muted-foreground">
                Runbook:{" "}
                <a
                  href={getDocsUrl("/integracoes/gateway-runbook-suporte.html")}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  incidentes webhook
                </a>
                {" · "}
                CLI: <code className="text-[10px]">npm run siga:gateway-events-recent -- --failures-only</code>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
