"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Activity,
  Building2,
  CalendarDays,
  CreditCard,
  Globe,
  LayoutDashboard,
  ListTodo,
  Mail,
  MessageCircle,
  RefreshCw,
  Shield,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getAdminAccessToken } from "@/lib/admin-session"
import { getCreateSchoolUrl, getDocsUrl, getSaasApiUrl, getWebUrl } from "@/lib/ecosystem-urls"
import { fetchSaasAuditLogs, type SaasAuditLogRow } from "@/lib/saas-api"

interface Stats {
  totalTenants: number
  activeTenants: number
  trialTenants: number
  suspendedTenants: number
  totalStudents: number
  mrrAoa: number
  pastDueTenants?: number
  trialExpiredTenants?: number
  exemptTenants?: number
}

function formatAoa(value: number) {
  return new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  }).format(value)
}

const QUICK_LINKS = [
  { href: "/tenants", label: "Escolas clientes", icon: Building2 },
  { href: "/tasks", label: "Fila operacional", icon: ListTodo },
  { href: "/calendar", label: "Agenda SaaS", icon: CalendarDays },
  { href: "/mail", label: "Avisos", icon: Mail },
  { href: "/chat", label: "Suporte operador", icon: MessageCircle },
  { href: "/subscriptions", label: "Subscrições", icon: CreditCard },
  { href: "/domains", label: "Domínios", icon: Globe },
  { href: "/gateway-webhooks", label: "Webhooks", icon: Activity },
  { href: "/platform-admins", label: "Operadores", icon: Shield },
  { href: "/pricing", label: "Catálogo planos", icon: LayoutDashboard },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [logs, setLogs] = useState<SaasAuditLogRow[]>([])
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
    try {
      const [statsRes, audit] = await Promise.all([
        fetch(getSaasApiUrl("/api/saas/stats"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetchSaasAuditLogs(token, 8),
      ])
      if (statsRes.status === 401) {
        setNeedsAuth(true)
        setLoading(false)
        return
      }
      const statsJson = (await statsRes.json()) as { stats?: Stats; error?: string }
      if (!statsRes.ok) throw new Error(statsJson.error || "Falha ao carregar métricas.")
      setStats(statsJson.stats ?? null)
      if (audit.ok) setLogs(audit.logs ?? [])
      else setLogs([])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha de rede.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel SaaS</h1>
          <p className="text-muted-foreground">
            Escolas, trials, receita mensal e eventos recentes da plataforma.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button size="sm" asChild>
            <a href={getCreateSchoolUrl()} target="_blank" rel="noreferrer">
              Nova escola (WEB)
            </a>
          </Button>
        </div>
      </div>

      {needsAuth ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Inicie sessão como administrador da plataforma.{" "}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Escolas", value: stats?.totalTenants, href: "/tenants" },
          { label: "Activas (a pagar)", value: stats?.activeTenants, href: "/tenants" },
          { label: "Em trial", value: stats?.trialTenants, href: "/tenants" },
          {
            label: "Trial expirado",
            value: stats?.trialExpiredTenants,
            href: "/tasks",
            warn: (stats?.trialExpiredTenants ?? 0) > 0,
          },
          {
            label: "Em atraso",
            value: stats?.pastDueTenants,
            href: "/tasks",
            warn: (stats?.pastDueTenants ?? 0) > 0,
          },
          { label: "Suspensas", value: stats?.suspendedTenants, href: "/tenants" },
          { label: "Sem cobrança", value: stats?.exemptTenants, href: "/tenants" },
          {
            label: "Receita mensal (MRR)",
            value: stats ? formatAoa(stats.mrrAoa) : undefined,
            href: "/subscriptions",
          },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="rounded-xl">
            <Card
              className={
                item.warn
                  ? "h-full border-amber-500/50 bg-amber-500/5 transition-colors hover:bg-amber-500/10"
                  : "h-full transition-colors hover:bg-muted/40"
              }
            >
              <CardHeader className="pb-2">
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {loading ? "…" : (item.value ?? "—")}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        A receita mensal conta só escolas activas e cobradas: trials, escolas em atraso, públicas
        e com cobranças pausadas ficam de fora. Alunos activos: {loading ? "…" : (stats?.totalStudents ?? "—")}.
      </p>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Atalhos do Control Center
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_LINKS.map((link) => (
            <Button key={link.href} variant="outline" className="justify-start" asChild>
              <Link href={link.href}>
                <link.icon className="size-4" />
                {link.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Eventos recentes</CardTitle>
            <CardDescription>Últimas alterações feitas na plataforma</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/audit">Ver auditoria</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">Sem eventos.</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{log.action}</Badge>
                  <span className="text-muted-foreground">
                    {log.tenant_name || log.tenant_slug || log.entity}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString("pt-AO")}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm">
        <a className="underline" href={getWebUrl("/pricing")} target="_blank" rel="noreferrer">
          Página comercial (WEB)
        </a>
        <span className="text-muted-foreground">·</span>
        <a
          className="underline"
          href={getDocsUrl("/admin/control-center.html")}
          target="_blank"
          rel="noreferrer"
        >
          Manual ADMIN (DOC)
        </a>
      </div>
    </div>
  )
}
