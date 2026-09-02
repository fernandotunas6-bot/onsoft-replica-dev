"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, ExternalLink, LifeBuoy, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getAdminAccessToken } from "@/lib/admin-session"
import { getDocsUrl, getSigaUrl, getWebUrl } from "@/lib/ecosystem-urls"
import {
  fetchGatewayWebhookMetrics,
  type GatewayWebhookEventRow,
} from "@/lib/saas-api"

const SUPPORT_LINKS = [
  {
    title: "Control Center (manual)",
    href: getDocsUrl("/admin/control-center.html"),
    desc: "Tenants, planos, domínios e operadores",
  },
  {
    title: "Runbook gateway",
    href: getDocsUrl("/integracoes/gateway-runbook-suporte.html"),
    desc: "Diagnóstico EMIS / Unitel para suporte",
  },
  {
    title: "Checklist produção",
    href: getDocsUrl("/integracoes/gateway-producao.html"),
    desc: "Antes de ir a produção com pagamentos",
  },
  {
    title: "Criar escola (WEB)",
    href: getWebUrl("/start"),
    desc: "Wizard comercial se o cliente ainda não tem tenant",
  },
  {
    title: "SIGA escolar",
    href: getSigaUrl("/"),
    desc: "Abrir operação da escola (após provisionamento)",
  },
]

export default function ChatPage() {
  const [failures, setFailures] = useState<GatewayWebhookEventRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await getAdminAccessToken()
    if (!token) {
      setNeedsAuth(true)
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    const result = await fetchGatewayWebhookMetrics(token, 50)
    if (!result.ok) setError(result.error || "Falha ao carregar contexto.")
    setFailures(result.metrics?.recentFailures ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suporte operador</h1>
          <p className="text-muted-foreground">
            Mesa de ajuda do Control Center — manuais DOC + falhas recentes do gateway.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {needsAuth ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LifeBuoy className="size-4" />
              Canais e manuais
            </CardTitle>
            <CardDescription>Documentação viva — não chat fictício</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {SUPPORT_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-start justify-between gap-3 rounded-md border px-3 py-3 text-sm hover:bg-muted/50"
              >
                <div>
                  <div className="font-medium">{link.title}</div>
                  <div className="text-muted-foreground">{link.desc}</div>
                </div>
                <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Falhas recentes (contexto)</CardTitle>
              <CardDescription>Para o operador abrir ticket / runbook</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/gateway-webhooks">Webhooks</Link>
            </Button>
          </CardHeader>
          <CardContent className="max-h-[420px] space-y-2 overflow-y-auto">
            {failures.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">Sem falhas recentes.</p>
            ) : (
              failures.map((row) => (
                <div key={row.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">{row.channel}</Badge>
                    <span className="text-muted-foreground">
                      {row.school_name || row.tenant_slug || "escola"}
                    </span>
                  </div>
                  <p className="mt-1">{row.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("pt-AO")}
                    {row.reference ? ` · ref ${row.reference}` : ""}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4" />
            Nota
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Mensagens internas entre colegas da escola vivem no SIGA (painel da conta). Aqui o
          «chat» é a mesa do operador da plataforma.
        </CardContent>
      </Card>
    </div>
  )
}
